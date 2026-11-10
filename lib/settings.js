/**
 * 键值存储
 *
 * canbox 模式：直接复用 canbox-core 的 store（{Users}/data/{appId}/store/{name}.json）。
 * 独立运行：回退到 {userData}/filecommander-data/{name}.json，不依赖第三方包。
 *
 * 两种实现都暴露 get / set / store，调用方不感知运行环境。
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function canboxStore(name) {
    if (!global.__CANBOX_CORE_PATH__ || !global.__CANBOX_ENV__) return null;
    const storeModule = require(path.join(global.__CANBOX_CORE_PATH__, 'lib', 'store'));
    return storeModule.getStore(
        global.__CANBOX_ENV__.appId,
        name,
        path.join(global.__CANBOX_ENV__.usersPath, 'data')
    );
}

function localStore(name) {
    const dir = path.join(app.getPath('userData'), 'filecommander-data');
    const file = path.join(dir, `${name}.json`);
    let data = {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (parsed && typeof parsed === 'object') data = parsed;
    } catch (error) {
        // 首次运行或文件损坏：按空数据启动
    }

    function persist() {
        fs.mkdirSync(dir, { recursive: true });
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
        fs.renameSync(tmp, file);
    }

    return {
        get(key) {
            return data[key];
        },
        set(key, value) {
            data[key] = value;
            persist();
        },
        get store() {
            return { ...data };
        }
    };
}

function getStore(name) {
    return canboxStore(name) || localStore(name);
}

module.exports = { getStore };
