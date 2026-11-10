/**
 * preload 同步下发的启动数据。
 * 整个渲染进程只读取一次，避免多处调用 sendSync。
 */
export const boot = window.filecommander.bootstrap();
