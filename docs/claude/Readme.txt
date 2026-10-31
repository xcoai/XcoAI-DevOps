Claude目录包含内容：
1.全局配置使用的CLAUDE.md
    比如本目录下CLAUDE.md文件复制替换当前系统对应文件：/Users/{用户}/.claude/CLAUDE.md
2.项目配置使用的commands/skills等
    比如本目录下commands/skills等目录复制替换对应项目目录：{项目}/.claude/

指令参考：
/plan               自动拆解需求出实施方案
/code-review        审查代码质量
/build-fix          修构建错误
/security-scan      做安全审计
/figma-to-html      根据figma设计稿生成html

对话参考：
示例1：根据这个设计稿生成HTML并且存储在项目docs/prd目录：https://www.figma.com/design/xxx/xxx?node-id=xxx&m=dev
参考文档：https://juejin.cn/post/7681626346015948836

Figma运行条件
1.获取figma token路径：
登录 Figma，点击头像进入 Settings
找到 Security → Personal access tokens
点击 Generate new token，输入名称
权限勾选：File content (read-only) 和 Current user (read-only)
复制生成的 Token（以 figd_ 开头）

2.安装figma的mcp服务
claude mcp add figma -- npx -y figma-code-mcp
echo 'export FIGMA_TOKEN="你的_figma_token"' >> ~/.zshrc
source ~/.zshrc

3.调用方法：
**方式一：自动触发**  
只要你在对话中提到"Figma"、"设计稿转 HTML"等关键词，Claude 会自动加载这个 Skill。

**方式二：手动调用**  
在对话框里输入 `/figma-to-html`，强制激活该 Skill。

**示例指令**：

```text
根据这个设计稿生成 HTML：{复制figma对应设计页面中share/link}
```