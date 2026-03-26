export const lenovoChartTheme = {
  color: ['#E12726', '#0073CE', '#00A650', '#F5A623', '#8B5CF6', '#000000', '#EC4899', '#14B8A6'],
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#000000',
  },
  title: {
    textStyle: {
      color: '#000000',
      fontSize: 14,
      fontWeight: 600,
    },
  },
  tooltip: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#E5E5E5',
    borderWidth: 1,
    textStyle: {
      color: '#000000',
      fontSize: 12,
    },
    extraCssText: 'box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 6px;',
  },
  legend: {
    textStyle: {
      color: '#A2A2A2',
      fontSize: 12,
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#E5E5E5' } },
    axisTick: { lineStyle: { color: '#E5E5E5' } },
    axisLabel: { color: '#A2A2A2', fontSize: 11 },
    splitLine: { lineStyle: { color: '#F0F0F0' } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#A2A2A2', fontSize: 11 },
    splitLine: { lineStyle: { color: '#F0F0F0', type: 'dashed' as const } },
  },
};

export const chartColors = {
  red: '#E12726',
  blue: '#0073CE',
  green: '#00A650',
  orange: '#F5A623',
  purple: '#8B5CF6',
  dark: '#000000',
  positive: '#00A650',
  negative: '#E12726',
  neutral: '#A2A2A2',
};
