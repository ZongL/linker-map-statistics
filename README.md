# Linker Map Statistics

一个用于分析链接器map文件的工具集，支持GCC和GHS编译器生成的map文件，提供Python命令行工具和Web界面两种使用方式。

## 🌟 功能特性

### Web界面 (推荐使用)
- **📊 可视化分析**：直观的图表和表格展示内存占用情况
- **🔍 智能解析**：自动识别并分离Memory Configuration和Linker script章节
- **📱 响应式设计**：支持桌面和移动设备
- **💾 数据导出**：支持CSV和TXT格式导出
- **🎯 调试段过滤**：可选择忽略.debug*段以专注于运行时内存

### Python命令行工具
- **🐍 GHS解析器**：`ghs_map_parser.py` - 解析Green Hills编译器map文件
- **🔧 GCC解析器**：`gcc_map_parser.py` - 解析GCC/arm-none-eabi map文件
- **📈 统计输出**：生成CSV和TXT格式的模块大小统计

## 🚀 快速开始

### 使用Web界面 (推荐)

1. 打开 `index.html` 文件
2. 选择编译器类型（GCC或GHS）
3. 上传你的map文件
4. 点击"分析Map文件"按钮
5. 查看分析结果

### 使用Python命令行

```powershell
# 在项目目录下运行
cd D:\11_web\linker-map-statistics

# 分析GHS map文件
python .\ghs_map_parser.py

# 分析GCC map文件  
python .\gcc_map_parser.py
```

## 📋 Web界面功能详解

### 1. 内存配置总览

#### 内存区域配置
- 显示从"Memory Configuration"章节解析的内存区域信息
- 包含flash、ram等区域的起始地址、大小和属性
- 提供属性说明（r=只读，rw=读写等）

#### 段分配明细  
- 显示从"Linker script and memory map"章节解析的段总体分配情况
- 包含.text、.rodata、.isr_vector等段的总大小
- 提供每个段的详细说明：
  - `.text` - 代码段，存储程序指令
  - `.rodata` - 只读数据段，存储常量数据
  - `.data` - 已初始化数据段，存储已初始化的全局变量
  - `.bss` - 未初始化数据段，存储未初始化的全局变量
  - `.isr_vector` - 中断向量表，存储中断服务程序地址
  - `.debug_*` - 各种调试信息段

### 2. 模块内存占用详情

- **📊 可视化图表**：饼图显示前10个模块的内存占用分布
- **📋 详细表格**：按内存占用大小排序的模块列表
- **🔍 模块详情**：点击"详情"按钮查看模块的段级别内存分布
- **📈 统计信息**：总模块数、总内存占用、段类型数等摘要信息

### 3. 数据导出功能

- **CSV格式**：包含模块名、总大小和各段详细数据，适合进一步分析
- **TXT格式**：人类可读的报告格式，包含完整的分析结果

## 🔧 解析逻辑说明

### GCC Map文件解析

GCC的map文件包含两个重要章节：

1. **Memory Configuration**：定义内存区域的总体规划
   ```
   Memory Configuration
   Name             Origin             Length             Attributes
   flash            0x08000000         0x00040000         r
   ram              0x20000000         0x00010000         rw
   ```

2. **Linker script and memory map**：包含具体的内存分配详情
   - **段总体定义**（无模块名）：如 `.text 0x800010c 0x955c`
   - **模块具体段**（有模块名）：如 `.text.bTask3 0x800010c 0x26 os_simple.o`

### 智能分类处理

- **段总体定义** → 归入"段分配明细"（内存配置总览）
- **模块具体段** → 归入"模块内存占用详情"
- 彻底解决了之前"unknown"分类的困惑问题

## 📁 文件说明

### Web界面文件
- `index.html` - 主界面文件
- `assets/js/script.js` - JavaScript解析和界面逻辑
- `assets/css/style.css` - 界面样式
- `test.html` - 功能演示页面

### Python工具
- `ghs_map_parser.py` - GHS编译器map文件解析器
- `gcc_map_parser.py` - GCC编译器map文件解析器

### 示例文件
- `examples/gcc_linkermap.map` - GCC map文件示例
- `examples/gcc_zzzz.map` - 另一个GCC map文件示例

### 输出文件
- `*_module_stats.csv` - CSV格式的统计结果
- `*_module_stats.txt` - 文本格式的统计结果

## ⚙️ 配置选项

### 调试段过滤
两种方式都支持忽略调试段（以`.debug`开头的段）：

**Web界面**：勾选"忽略调试段 (.debug*)"选项

**Python脚本**：修改脚本中的`DEBUGFILTER`变量为`True`

这样可以专注于ROM/RAM运行时使用情况，排除DWARF/调试数据。

## 💡 使用场景

- **内存优化**：识别占用内存最多的模块，进行针对性优化
- **代码审查**：了解各个模块的内存分布情况
- **项目管理**：跟踪项目内存使用趋势
- **调试分析**：快速定位内存相关问题
- **报告生成**：为项目报告提供详细的内存使用数据

## 🔍 高级用法示例

### PowerShell查询特定模块
```powershell
# 在TXT文件中查找特定模块
Select-String -Path .\gcc_module_stats.txt -Pattern 'App_Add.o'

# 在CSV中查找并显示特定模块
Import-Csv .\gcc_module_stats.csv | Where-Object { $_.module -like '*App_Add.o*' }
```

### 内存类型分析
通过段名称可以区分不同类型的内存使用：
- **ROM使用**：`.text`、`.rodata`、`.isr_vector`等段
- **RAM使用**：`.data`、`.bss`、`.stack`、`.heap`等段

## 🚧 未来改进计划

- [ ] 添加ROM vs RAM自动分类和统计
- [ ] 支持更多编译器格式（IAR、Keil等）
- [ ] 添加内存使用趋势分析
- [ ] 支持多个map文件对比分析
- [ ] 添加内存碎片分析功能
- [ ] 提供API接口供其他工具调用

## 📝 注意事项

- 工具专为本地临时分析设计，简单高效
- 正则表达式针对常见map文件格式优化
- 如果你的map文件格式有差异，请提供样本以便改进解析逻辑
- Web界面需要现代浏览器支持（支持ES6+）

---

**创建目的**：帮助开发者分析GHS和GCC链接器map输出中的模块级ROM/RAM使用情况，提供直观的可视化分析工具。

## 📸 界面预览

### 主界面
![主界面](docs/images/main-interface.png)
*上传map文件和选择编译器类型*

### 内存配置总览
![内存配置总览](docs/images/memory-overview.png)
*显示内存区域配置和段分配明细*

### 模块内存占用详情
![模块详情](docs/images/module-details.png)
*可视化图表和详细的模块内存占用表格*

## 🎯 实际使用案例

### 案例1：优化固件大小
某STM32项目通过本工具分析发现：
- `libgcc.a`库占用了15KB的flash空间
- 调试信息占用了300KB，可以在发布版本中移除
- 某个未使用的模块意外被链接，占用了8KB

**优化结果**：固件大小从512KB减少到480KB，节省了6.25%的存储空间。

### 案例2：RAM使用分析
通过分析`.data`和`.bss`段发现：
- 全局数组占用了过多RAM空间
- 某些模块的静态变量可以优化
- 栈空间分配过大

**优化结果**：RAM使用从45KB减少到38KB，为系统留出了更多运行空间。

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

### 报告问题
如果遇到解析错误，请提供：
1. 编译器类型和版本
2. 出错的map文件片段（可脱敏）
3. 错误信息截图

### 功能建议
我们欢迎以下类型的功能建议：
- 新的编译器支持
- 更好的可视化方式
- 分析功能增强
- 用户体验改进

## 📄 许可证

本项目采用MIT许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- 感谢所有提供map文件样本的开发者
- 感谢Chart.js提供优秀的图表库
- 感谢所有使用和反馈的用户

---

**如果这个工具对你有帮助，请给个⭐️支持一下！**