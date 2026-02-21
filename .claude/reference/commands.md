# 开发命令速查

## Desktop App 开发

```bash
cd desktop
npm install                    # 安装前端依赖
npm run tauri dev              # 启动开发模式（前端 + Rust 热重载）
npm run tauri build            # 构建 .app / .dmg
```

## Rust 检查

```bash
cd desktop/src-tauri
cargo check                    # 类型检查
cargo test                     # 运行测试
cargo clippy                   # Lint
```

## v1 CLI（可选）

```bash
npm install                    # 根目录
node bin/deco.js help          # CLI 帮助
```
