/**
 * 本地可执行二进制识别（Linux）。
 *
 * 只把 ELF 视为“直接运行”的对象：AppImage、无扩展名的 ELF、指向它们的符号链接都能启动；
 * shell 脚本等文本可执行文件仍交给系统关联（本机 application/x-shellscript → vim），
 * 与系统文件管理器一致，避免按 Enter/F4 时把用户想编辑的脚本静默放到后台执行。
 */
const fs = require('./fsx');

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF

async function isNativeExecutable(filePath) {
    if (process.platform !== 'linux') return false;
    let handle = null;
    try {
        handle = await fs.promises.open(filePath, 'r');
        const header = Buffer.alloc(4);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        return bytesRead === header.length && header.equals(ELF_MAGIC);
    } catch (error) {
        return false;
    } finally {
        if (handle) {
            try {
                await handle.close();
            } catch (error) {
                // 关闭失败不影响判定结果
            }
        }
    }
}

module.exports = { isNativeExecutable };
