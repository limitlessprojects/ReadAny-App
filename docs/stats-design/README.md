# Reading Stats Design

这组文档用于定义 ReadAny 新一代阅读统计系统的产品与工程基线。

目标不是先重构页面，而是先回答三个问题：

1. 统计系统应该按什么层级拆分。
2. `日 / 周 / 月 / 年 / 总` 五个维度分别应该呈现什么。
3. 分享图、周期切换、长期累计这几类能力如何统一进同一套模型。

文档目录：

- [01-architecture-and-schema.md](/Users/tuntuntutu/Project/ReadAny/docs/stats-design/01-architecture-and-schema.md)
- [02-period-report-and-sharing.md](/Users/tuntuntutu/Project/ReadAny/docs/stats-design/02-period-report-and-sharing.md)
- [03-implementation-roadmap.md](/Users/tuntuntutu/Project/ReadAny/docs/stats-design/03-implementation-roadmap.md)

当前约束：

- 暂不改业务代码。
- 暂不重构统计页面。
- 先冻结模型与交互边界，再进入实现。
