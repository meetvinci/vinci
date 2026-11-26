import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { defineConfig } from 'fumadocs-mdx/config';
import { docsAlertRemark } from './src/services/docs/docs-alert.utils.ts';

// The guides are written for GitHub: its alert blocks and mermaid code blocks become the site's own components.
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [docsAlertRemark, remarkMdxMermaid],
  },
});
