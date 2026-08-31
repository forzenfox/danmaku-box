// assets/charts.js — 可行性置信度横向条形图
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var warn = style.getPropertyValue('--warn').trim();

  var el = document.getElementById('chart-feasibility');
  if (!el || typeof echarts === 'undefined') return;

  var chart = echarts.init(el, null, { renderer: 'svg' });

  var items = [
    { name: '弹幕库与分组管理', value: 95, color: accent2 },
    { name: '一键回填输入栏', value: 90, color: accent2 },
    { name: '斗鱼站点适配', value: 90, color: accent2 },
    { name: '右键菜单收藏（聊天区路径）', value: 85, color: accent2 },
    { name: '右键菜单收藏（飘屏弹幕路径）', value: 50, color: warn }
  ];

  chart.setOption({
    animation: false,
    grid: { left: 30, right: 56, top: 20, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      formatter: function (p) {
        return p[0].name + '<br/>置信度: <b>' + p[0].value + '</b> / 100';
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
      axisLabel: { color: ink, fontSize: 12.5, width: 220, overflow: 'truncate' }
    },
    series: [{
      type: 'bar',
      data: items.map(function (i) {
        return { value: i.value, itemStyle: { color: i.color, borderRadius: [0, 4, 4, 0] } };
      }),
      barWidth: 18,
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
