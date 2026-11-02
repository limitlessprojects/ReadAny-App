# Implementation Roadmap

## 总体策略

先定模型，再做引擎，再接页面，最后加分享。

不要反过来从页面开始，因为一旦先做 UI，后面 `日 / 周 / 月 / 年 / 总` 的边界很快会乱掉。

## Phase 0：冻结方案

目标：

- 定下统计分层
- 定下五个维度的报告边界
- 定下分享图输入模型

产出：

- 本目录三份设计文档

## Phase 1：重构 core 统计底座

目标：

- 从 `DailyStats / OverallStats` 升级为 `DailyReadingFact + PeriodReports`

建议动作：

1. 新建统一 stats types
   - `StatsDimension`
   - `DailyReadingFact`
   - `BaseStatsReport`
   - `DayReport / WeekReport / MonthReport / YearReport / LifetimeReport`

2. 新建 fact builder
   - 从 session 聚合成日事实
   - 统一本地时区分桶

3. 新建 period report builder
   - `buildDayReport`
   - `buildWeekReport`
   - `buildMonthReport`
   - `buildYearReport`
   - `buildLifetimeReport`

4. 保留旧接口一段时间
   - 避免页面一次性全部断裂

## Phase 2：引入 view model

目标：

- 页面不直接组装 report 原始字段

建议动作：

1. 在 core 或 app 层新增 `stats-view-model.ts`
2. 把 report 转成 UI 可直接消费的模块
3. 统一桌面与移动的模块字段命名

## Phase 3：桌面端统计页重构

目标：

- 做成真正的“维度 + 周期”报告页

建议动作：

1. 顶部做维度切换
2. 周期导航抽成统一组件
3. 卡片区根据 `ViewModel` 动态渲染
4. 先完成：
   - 日
   - 周
   - 月
   - 总
5. 年度可稍后补全

## Phase 4：移动端统计页接入

目标：

- 用同一套 report / view model 驱动 Expo 页面

建议动作：

1. 保持数据结构一致
2. 移动端单独设计滚动布局
3. 将复杂图表做成轻量版

## Phase 5：分享图系统

目标：

- 每个维度都能生成规范图片

建议动作：

1. 新建 `StatsShareCardRenderer`
2. 先做静态模板生成
3. 后做系统分享和保存图片

## 当前实现的最大风险

### 1. 时区问题

当前 [packages/core/src/stats/reading-stats.ts](/Users/tuntuntutu/Project/ReadAny/packages/core/src/stats/reading-stats.ts) 里按天分桶使用 UTC 字符串。

风险：

- 跨时区或本地深夜阅读会归到错误日期
- streak 和日统计都可能偏差

这是后续重构最优先要修的地方。

### 2. 当前 session 合并策略太临时

现在 [packages/core/src/stats/live-reading-stats.ts](/Users/tuntuntutu/Project/ReadAny/packages/core/src/stats/live-reading-stats.ts) 是在已有 `dailyStats / overall` 上临时 merge 当前 session。

风险：

- 报告维度变复杂后，很难每种 report 都手动 merge

建议未来变成：

- 先把当前 session 投影成“临时日事实”
- 再与历史 facts 合并
- 最后统一生成 report

### 3. 页面承担过多逻辑

当前 [packages/app/src/components/stats/ReadingStatsPanel.tsx](/Users/tuntuntutu/Project/ReadAny/packages/app/src/components/stats/ReadingStatsPanel.tsx) 里同时承担：

- 数据请求
- 周期切换
- 日期计算
- 图表数据映射
- 页面渲染

风险：

- 代码会越堆越大
- 移动端难以复用

## 建议的正式开工顺序

最稳的顺序是：

1. 定类型
2. 定分桶口径
3. 建日事实
4. 建五种 report
5. 建 view model
6. 桌面端接入
7. 移动端接入
8. 分享图接入

## 阶段验收标准

### Phase 1 验收

- 能从 session 生成正确的 `DailyReadingFact`
- 本地时区分桶正确
- streak 结果稳定

### Phase 2 验收

- 五种 report 都能产出
- 页面不再自己算周期数据

### Phase 3 验收

- 桌面端支持 `日 / 周 / 月 / 年 / 总`
- 前四种支持切换周期

### Phase 4 验收

- 移动端使用同一套 report
- 信息层级与桌面一致

### Phase 5 验收

- 五个维度都能生成分享图
- 分享图不是页面截图
