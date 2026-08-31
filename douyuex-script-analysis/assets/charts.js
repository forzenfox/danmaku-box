// assets/charts.js — 技术资产复用价值评分横向条形图
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var warn = style.getPropertyValue('--warn').trim();

  var el = document.getElementById('chart-reuse');
  if (!el || typeof echarts === 'undefined') return;

  var chart = echarts.init(el, null, { renderer: 'svg' });

  var items = [
    { name: '输入框回填/发送范式', value: 95, color: accent2 },
    { name: '弹幕 DOM 选择器字典', value: 92, color: accent2 },
    { name: 'WebSocket STT 协议实现', value: 88, color: accent2 },
    { name: '官方收藏接口知识', value: 80, color: accent2 },
    { name: '原生右键面板扩展机制', value: 75, color: accent },
    { name: '弹幕历史导航交互范本', value: 70, color: accent },
    { name: '代码整体直接二次开发', value: 25, color: warn },
    { name: '外部服务依赖功能', value: 15, color: warn }
  ];

  chart.setOption({
    animation: false,
    grid: { left: 30, right: 56, top: 20, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      formatter: function (p) {
        return p[0].name + '<br/>复用价值: <b>' + p[0].value + '</b> / 100';
      }
    },
    xAxis: {
      type: 'value',
      max: 100,
      splitLine: { lineStyle: { color: rule } },
      axisLabel: { color: muted, fontFamily: 'GeistMono, monospace' }
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map(function (i) { return i.name; }),
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false },
      axisLabel: { color: ink, fontSize: 12.5, width: 190, overflow: 'truncate' }
    },
    series: [{
      type: 'bar',
      data: items.map(function (i) {
        return { value: i.value, itemStyle: { color: i.color, borderRadius: [0, 4, 4, 0] } };
      }),
      barWidth: 16,
      label: {
        show: true,
        position: 'right',
        formatter: '{c}',
        color: ink,
        fontFamily: 'GeistMono, monospace',
        fontWeight: 700,
        fontSize: 12
      }
    }]
  });

  window.addEventListener('resize', function () { chart.resize(); });
})();
