// 霸王模式，F12 控制台敲 window.__palab_overlord__() 就完事了
// 再敲一次关掉，传 false 不记成绩（
let _overlord = false;
let _overlordRecord = true;

// 别问为什么不下划线导出，问就是模块级变量最稳（
export function isOverlord(): boolean { return _overlord; }
export function overlordRecord(): boolean { return _overlordRecord; }

// 挂到 window 上，调试党狂喜（
if (typeof window !== 'undefined') {
  (window as any).__palab_overlord__ = (record = true) => {
    _overlord = !_overlord;
    _overlordRecord = record;
    console.log(
      `%c霸王模式%c ${_overlord ? 'ON' : 'OFF'}%c | 记成绩: ${_overlordRecord ? 'YES' : 'NO'}`,
      'color:#FFD700;font-weight:bold;', 'color:#fff;', 'color:#aaa;'
    );
    return _overlord;
  };
}
