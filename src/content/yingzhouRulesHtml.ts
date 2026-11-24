import MarkdownIt from 'markdown-it'
import complete from '../../docs/颍州扎杠麻将完整规则.md?raw'
import beginner from '../../docs/颍州扎杠麻将新手规则.md?raw'

const markdown = new MarkdownIt({ html: false, breaks: true })
markdown.renderer.rules.table_open = () => '<div class="rules-source-table"><table>'
markdown.renderer.rules.table_close = () => '</table></div>\n'
export const rulesHtml = { complete: markdown.render(complete), beginner: markdown.render(beginner) }
