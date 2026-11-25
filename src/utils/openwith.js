/**
 * 打开文件的统一入口。
 *
 * spec 支持两种形式：
 *   - 'app:<.desktop 绝对路径>'：使用系统已注册的应用程序打开（Linux）
 *   - 程序路径或 PATH 中的命令：直接启动该程序；空串表示系统默认方式
 */
export function openFileWith(api, path, spec) {
    if (typeof spec === 'string' && spec.startsWith('app:')) {
        return api.openWithApp({ path, appId: spec.slice(4) });
    }
    return api.openWith({ path, program: spec || '' });
}
