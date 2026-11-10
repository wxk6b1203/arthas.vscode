/**
 * Promise 超时工具：redhat.java 预热期间语言服务请求可能长时间挂起，
 * 超时/失败统一返回 null，调用方走兜底逻辑。
 */
export function withTimeout<T>(p: Thenable<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
