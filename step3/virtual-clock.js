(function () {
  if (window.__vc) return;

  const RealDate = Date;
  const realPerformanceNow = performance.now.bind(performance);

  let virtualNow = 0;

  function VirtualDate(...args) {
    if (!new.target) {
      return RealDate(...(args.length ? args : [virtualNow]));
    }
    if (args.length) return new RealDate(...args);
    return new RealDate(virtualNow);
  }

  VirtualDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(VirtualDate, RealDate);
  VirtualDate.now = () => virtualNow;
  VirtualDate.parse = RealDate.parse.bind(RealDate);
  VirtualDate.UTC = RealDate.UTC.bind(RealDate);

  Object.defineProperty(window, "Date", {
    configurable: true,
    writable: true,
    value: VirtualDate,
  });

  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => virtualNow,
  });

  // ---- S3.2：把「浏览器自动 ticker」换成「手动队列」----
  // rAF 回调会收到一个 timestamp 参数，那本身也是一个时间源，
  // 所以这里要连「调度」和「时间」一起接管。
  const realRaf = window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : null;
  const realCancelRaf = window.cancelAnimationFrame
    ? window.cancelAnimationFrame.bind(window)
    : null;

  let rafId = 1;
  let rafQueue = [];

  // 冲刷一次：把「下一帧」这一批回调，按当前虚拟时间跑一遍
  function flushRaf() {
    if (rafQueue.length === 0) return;

    // 先快照、再清空：回调里新注册的 rAF 属于「下一帧」，
    // 必须落进新队列，否则自驱动动画会在一帧内无限循环。
    const batch = rafQueue.slice();
    rafQueue.length = 0;

    for (const entry of batch) {
      if (entry.cancelled) continue;
      try {
        entry.callback(virtualNow); // ← 虚拟时间伪装成「这一帧的时间戳」
      } catch {
        // 单个回调抛错，不该拖垮整帧
      }
    }
  }

  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: function requestAnimationFrame(callback) {
      if (typeof callback !== "function") return 0;
      const id = rafId++;
      rafQueue.push({ id, callback, cancelled: false });
      return id;
    },
  });

  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    writable: true,
    value: function cancelAnimationFrame(id) {
      for (const entry of rafQueue) {
        if (entry.id === id) entry.cancelled = true;
      }
    },
  });

  window.__vc = {
    seekToTime(ms) {
      virtualNow = Math.max(0, Number(ms) || 0);
      flushRaf(); // 拨完表，立刻让攒着的回调跑一遍
      return virtualNow;
    },
    now: () => virtualNow,
    realNow: realPerformanceNow,
    realRaf,
    realCancelRaf,
    pendingRaf: () => rafQueue.length,
  };
})();