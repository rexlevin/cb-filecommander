/**
 * 真实文件系统访问
 *
 * Electron 会接管 require('fs')：把 .asar 归档当作目录来访问——
 *   fs.stat('a.asar').isDirectory() === true
 *   fs.readdir('a.asar') 返回归档内的条目
 *   fs.readFile('a.asar') 报 ENOENT
 * 这会让 asar 在列表里显示成目录，复制/移动时被展开成归档内部内容。
 *
 * original-fs 绕过 asar 补丁，与 doubleCommander 一样把 asar 视为普通文件。
 * 所有针对用户文件的操作都必须走这里；应用自身的配置/图标读取仍可用 fs。
 */
let fs;
try {
    fs = require('original-fs');
} catch (error) {
    // 非 Electron 环境（如单元测试）退化为标准 fs
    fs = require('fs');
}

module.exports = fs;
