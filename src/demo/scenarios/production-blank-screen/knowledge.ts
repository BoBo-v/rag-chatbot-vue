import type { DemoKnowledgeChunk } from '../../types'

export const blankScreenKnowledgeChunks: DemoKnowledgeChunk[] = [
  {
    chunkId: 'doc-blank-screen-low-c1',
    documentId: 'kb-common-errors-v1',
    documentTitle: 'Web 前端通用异常分类指南.md',
    chunkIndex: 2,
    score: 0.38,
    vectorScore: 0.35,
    keywordScore: 0.42,
    text: `### 网页白屏常见排查方向
生产环境白屏可能的原因包括：
1. 资源路径引用错误（如 publicPath 配置不当导致 JS 404）；
2. 历史浏览器语法兼容性问题未经过 polyfill 转换；
3. 动态加载路由 chunk 超时或 CDN 节点缓存异常；
4. 全局未捕获的运行时 JS 异常中断挂载渲染。
因涉及分支众多，必须结合浏览器控制台 Console 日志及网络面板 Network 请求状态进行排查。`
  }
]
