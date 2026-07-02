console.log('[plugin-launcher] 启动器插件已加载');

// 注册搜索回调
window.szybko?.onSearch?.((ctx) => {
    console.log('[plugin-launcher] onSearch:', ctx.query);
    return [
        {
            id: 'launcher-test',
            title: `插件测试: ${ctx.query}`,
            subtitle: '来自启动器插件',
            icon: '🧪',
            score: 40,
            action: { type: 'clipboard.writeText', payload: { text: ctx.query } },
        },
    ];
});
