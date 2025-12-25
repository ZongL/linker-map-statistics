class MapAnalyzer {
    constructor() {
        this.results = null;
        this.sections = null;
        this.chart = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('mapFile');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const exportCsvBtn = document.getElementById('exportCsv');
        const exportTxtBtn = document.getElementById('exportTxt');
        const uploadLabel = document.querySelector('.upload-label');

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        analyzeBtn.addEventListener('click', () => this.analyzeFile());
        exportCsvBtn.addEventListener('click', () => this.exportCsv());
        exportTxtBtn.addEventListener('click', () => this.exportTxt());

        // 拖拽上传
        uploadLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadLabel.classList.add('dragover');
        });

        uploadLabel.addEventListener('dragleave', () => {
            uploadLabel.classList.remove('dragover');
        });

        uploadLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadLabel.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                this.handleFileSelect({ target: { files } });
            }
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        const analyzeBtn = document.getElementById('analyzeBtn');
        const uploadText = document.querySelector('.upload-text');

        if (file) {
            uploadText.textContent = `已选择: ${file.name}`;
            analyzeBtn.disabled = false;
        } else {
            uploadText.textContent = '选择Map文件';
            analyzeBtn.disabled = true;
        }
    }

    async analyzeFile() {
        const fileInput = document.getElementById('mapFile');
        const compilerType = document.querySelector('input[name="compiler"]:checked').value;
        const ignoreDebug = document.getElementById('ignoreDebug').checked;

        if (!fileInput.files[0]) {
            this.showError('请先选择一个map文件');
            return;
        }

        this.showLoading();
        this.hideError();

        try {
            const fileContent = await this.readFile(fileInput.files[0]);
            
            console.log(`文件大小: ${fileContent.length} 字符`);
            console.log(`忽略调试段: ${ignoreDebug}`);
            
            if (compilerType === 'gcc') {
                this.results = this.parseGccMap(fileContent, ignoreDebug);
            } else {
                this.results = this.parseGhsMap(fileContent, ignoreDebug);
            }

            console.log(`解析结果: ${this.results.length} 个模块`);
            this.displayResults();
        } catch (error) {
            console.error('分析错误:', error);
            this.showError(`分析文件时出错: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('文件读取失败'));
            reader.readAsText(file, 'utf-8');
        });
    }

    parseGccMap(content, ignoreDebug) {
        const lines = content.split('\n');
        
        // 解析Memory Configuration章节
        const memoryConfig = this.parseMemoryConfiguration(lines);
        
        // 解析Linker script and memory map章节
        const moduleResults = this.parseLinkerScriptSection(lines, ignoreDebug);
        
        // 存储内存配置信息
        this.memoryConfig = memoryConfig;
        
        return moduleResults;
    }

    parseMemoryConfiguration(lines) {
        const memoryConfig = [];
        let inMemorySection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === 'Memory Configuration') {
                inMemorySection = true;
                continue;
            }
            
            if (inMemorySection) {
                if (line === 'Linker script and memory map' || line === '') {
                    if (line === 'Linker script and memory map') break;
                    continue;
                }
                
                // 跳过表头
                if (line.includes('Name') && line.includes('Origin') && line.includes('Length')) {
                    continue;
                }
                
                // 解析内存区域行: flash 0x0000000008000000 0x0000000000040000 r
                const memPattern = /^(\w+)\s+0x([0-9A-Fa-f]+)\s+0x([0-9A-Fa-f]+)\s+(\w*)$/;
                const match = memPattern.exec(line);
                
                if (match) {
                    const name = match[1];
                    const origin = parseInt(match[2], 16);
                    const length = parseInt(match[3], 16);
                    const attributes = match[4] || '';
                    
                    memoryConfig.push({
                        name,
                        origin,
                        length,
                        attributes,
                        originHex: '0x' + match[2],
                        lengthHex: '0x' + match[3]
                    });
                }
            }
        }
        
        return memoryConfig;
    }

    parseLinkerScriptSection(lines, ignoreDebug) {
        // 找到"Linker script and memory map"章节开始位置
        let startIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === 'Linker script and memory map') {
                startIndex = i;
                break;
            }
        }
        
        if (startIndex === -1) {
            // 如果没找到该章节，使用原来的解析方式
            return this.parseGccMapLegacy(lines, ignoreDebug);
        }
        
        // 从该章节开始解析
        const relevantLines = lines.slice(startIndex);
        
        const pattern = /^\s*([.\w*+-]+)\s+0x[0-9A-Fa-f]+\s+0x([0-9A-Fa-f]+)(?:\s+(.+?))?[\r\n]*$/;
        const modules = {};
        const allSections = new Set();
        let matchCount = 0;
        let validEntries = 0;

        for (const line of relevantLines) {
            const match = pattern.exec(line);
            if (!match) continue;
            
            matchCount++;

            const section = match[1].trim();
            const sizeHex = match[2];
            let moduleRaw = match[3] ? match[3].trim() : 'unknown';

            // 忽略调试段
            if (ignoreDebug && section.startsWith('.debug')) {
                continue;
            }

            let size;
            try {
                size = parseInt(sizeHex, 16);
            } catch (e) {
                continue;
            }

            // 跳过大小为0的条目
            if (size === 0) {
                continue;
            }

            validEntries++;

            // 规范化模块名
            let module = moduleRaw;
            if (moduleRaw && moduleRaw !== 'unknown') {
                if ((moduleRaw.includes('/') || moduleRaw.includes('\\')) && 
                    !(moduleRaw.includes('(') && moduleRaw.includes(')'))) {
                    const parts = moduleRaw.split(/[/\\]/);
                    module = parts[parts.length - 1];
                }
            }

            allSections.add(section);
            if (!modules[module]) {
                modules[module] = {};
            }
            if (!modules[module][section]) {
                modules[module][section] = 0;
            }
            modules[module][section] += size;
        }

        console.log(`总匹配行数: ${matchCount}, 有效条目: ${validEntries}`);
        console.log(`段类型数: ${allSections.size}`);
        console.log(`模块数: ${Object.keys(modules).length}`);

        return this.processResults(modules, allSections);
    }

    parseGccMapLegacy(lines, ignoreDebug) {
        // 原来的解析方式，作为后备方案
        const pattern = /^\s*([.\w*+-]+)\s+0x[0-9A-Fa-f]+\s+0x([0-9A-Fa-f]+)(?:\s+(.+?))?[\r\n]*$/;
        const modules = {};
        const allSections = new Set();
        let matchCount = 0;
        let validEntries = 0;

        for (const line of lines) {
            const match = pattern.exec(line);
            if (!match) continue;
            
            matchCount++;

            const section = match[1].trim();
            const sizeHex = match[2];
            let moduleRaw = match[3] ? match[3].trim() : 'unknown';

            // 忽略调试段
            if (ignoreDebug && section.startsWith('.debug')) {
                continue;
            }

            let size;
            try {
                size = parseInt(sizeHex, 16);
            } catch (e) {
                continue;
            }

            // 跳过大小为0的条目
            if (size === 0) {
                continue;
            }

            validEntries++;

            // 规范化模块名
            let module = moduleRaw;
            if (moduleRaw && moduleRaw !== 'unknown') {
                if ((moduleRaw.includes('/') || moduleRaw.includes('\\')) && 
                    !(moduleRaw.includes('(') && moduleRaw.includes(')'))) {
                    const parts = moduleRaw.split(/[/\\]/);
                    module = parts[parts.length - 1];
                }
            }

            allSections.add(section);
            if (!modules[module]) {
                modules[module] = {};
            }
            if (!modules[module][section]) {
                modules[module][section] = 0;
            }
            modules[module][section] += size;
        }

        console.log(`总匹配行数: ${matchCount}, 有效条目: ${validEntries}`);
        console.log(`段类型数: ${allSections.size}`);
        console.log(`模块数: ${Object.keys(modules).length}`);

        return this.processResults(modules, allSections);
    }

    parseGhsMap(content, ignoreDebug) {
        const lines = content.split('\n');
        
        // 找到Module Summary部分
        let startIndex = -1;
        let endIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('Module Summary')) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) {
            throw new Error('未找到"Module Summary"部分，请确认这是一个有效的GHS map文件');
        }

        for (let i = startIndex + 1; i < lines.length; i++) {
            if (lines[i].includes('Global Symbols') || lines[i].startsWith('Global Symbols') ||
                lines[i].startsWith('Load Map')) {
                endIndex = i;
                break;
            }
        }

        if (endIndex === -1) {
            endIndex = lines.length;
        }

        const relevantLines = lines.slice(startIndex, endIndex);
        
        // 匹配格式: origin+size section [-> mem] module
        const pattern = /^\s*[0-9A-Fa-f]+\+([0-9A-Fa-f]+)\s+([^\s]+)(?:\s+->\s+\S+)?\s+(.+)$/;
        
        const modules = {};
        const allSections = new Set();

        for (const line of relevantLines) {
            const match = pattern.exec(line);
            if (!match) continue;

            const sizeHex = match[1];
            const section = match[2];
            const module = match[3].trim();

            // 忽略调试段
            if (ignoreDebug && section.startsWith('.debug')) {
                continue;
            }

            let size;
            try {
                size = parseInt(sizeHex, 16);
            } catch (e) {
                continue;
            }

            allSections.add(section);
            if (!modules[module]) {
                modules[module] = {};
            }
            if (!modules[module][section]) {
                modules[module][section] = 0;
            }
            modules[module][section] += size;
        }

        return this.processResults(modules, allSections);
    }

    processResults(modules, allSections) {
        const results = [];
        
        for (const [module, sections] of Object.entries(modules)) {
            const total = Object.values(sections).reduce((sum, size) => sum + size, 0);
            results.push({
                module,
                total,
                sections
            });
        }

        // 按总大小降序排序
        results.sort((a, b) => b.total - a.total);
        
        this.sections = Array.from(allSections).sort();
        return results;
    }

    displayResults() {
        const resultsDiv = document.getElementById('results');
        const totalModules = document.getElementById('totalModules');
        const totalMemory = document.getElementById('totalMemory');
        const totalSections = document.getElementById('totalSections');
        const tableBody = document.querySelector('#resultsTable tbody');

        // 计算总内存
        const totalMem = this.results.reduce((sum, item) => sum + item.total, 0);

        // 更新摘要
        totalModules.textContent = this.results.length;
        totalMemory.textContent = this.formatBytes(totalMem);
        totalSections.textContent = this.sections.length;

        // 显示内存配置总览
        this.displayMemoryConfiguration();

        // 清空表格
        tableBody.innerHTML = '';

        // 填充表格
        this.results.forEach((item, index) => {
            const row = document.createElement('tr');
            const percentage = ((item.total / totalMem) * 100).toFixed(2);
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td title="${item.module}">${this.truncateText(item.module, 40)}</td>
                <td>${item.total.toLocaleString()}</td>
                <td>${(item.total / 1024).toFixed(2)}</td>
                <td>${percentage}%</td>
                <td><button class="details-btn" onclick="analyzer.showDetails(${index})">详情</button></td>
            `;
            
            tableBody.appendChild(row);
        });

        // 创建图表
        this.createChart();

        resultsDiv.classList.remove('hidden');
    }

    displayMemoryConfiguration() {
        // 查找或创建内存配置显示区域
        let memoryConfigDiv = document.getElementById('memoryConfiguration');
        if (!memoryConfigDiv) {
            memoryConfigDiv = document.createElement('div');
            memoryConfigDiv.id = 'memoryConfiguration';
            memoryConfigDiv.className = 'memory-configuration';
            
            // 插入到摘要和图表之间
            const summaryDiv = document.querySelector('.summary');
            const chartContainer = document.querySelector('.chart-container');
            summaryDiv.parentNode.insertBefore(memoryConfigDiv, chartContainer);
        }

        if (this.memoryConfig && this.memoryConfig.length > 0) {
            let configHtml = `
                <div class="memory-config-header">
                    <h3>内存配置总览</h3>
                    <p>从Memory Configuration章节解析的内存区域信息</p>
                </div>
                <div class="memory-config-table">
                    <table>
                        <thead>
                            <tr>
                                <th>区域名称</th>
                                <th>起始地址</th>
                                <th>大小</th>
                                <th>大小(KB)</th>
                                <th>属性</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            this.memoryConfig.forEach(config => {
                const sizeKB = (config.length / 1024).toFixed(2);
                const attributeDesc = this.getAttributeDescription(config.attributes);
                
                configHtml += `
                    <tr>
                        <td><strong>${config.name}</strong></td>
                        <td><code>${config.originHex}</code></td>
                        <td>${this.formatBytes(config.length)}</td>
                        <td>${sizeKB} KB</td>
                        <td title="${attributeDesc}">${config.attributes}</td>
                    </tr>
                `;
            });

            configHtml += `
                        </tbody>
                    </table>
                </div>
            `;

            memoryConfigDiv.innerHTML = configHtml;
        } else {
            memoryConfigDiv.innerHTML = `
                <div class="memory-config-header">
                    <h3>内存配置总览</h3>
                    <p class="no-config">未找到Memory Configuration章节信息</p>
                </div>
            `;
        }
    }

    getAttributeDescription(attributes) {
        const descriptions = {
            'r': '只读 (Read-only)',
            'rw': '读写 (Read-Write)', 
            'x': '可执行 (Executable)',
            'rx': '只读可执行 (Read-Execute)',
            'rwx': '读写执行 (Read-Write-Execute)'
        };
        return descriptions[attributes] || attributes;
    }

    createChart() {
        const ctx = document.getElementById('memoryChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        // 取前10个模块用于图表显示
        const top10 = this.results.slice(0, 10);
        const labels = top10.map(item => this.truncateText(item.module, 20));
        const data = top10.map(item => item.total);
        const colors = this.generateColors(top10.length);

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '前10个模块内存占用分布',
                        font: {
                            size: 16
                        }
                    },
                    legend: {
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label;
                                const value = context.parsed;
                                const percentage = ((value / data.reduce((a, b) => a + b, 0)) * 100).toFixed(2);
                                return `${label}: ${this.formatBytes(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    showDetails(index) {
        const item = this.results[index];
        const modal = this.createModal();
        
        const modalContent = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h3>${item.module}</h3>
                <p><strong>总大小:</strong> ${this.formatBytes(item.total)}</p>
                <div class="section-details">
                    <h4>段详情:</h4>
                    ${Object.entries(item.sections).map(([section, size]) => 
                        `<div class="section-item">
                            <span>${section}</span>
                            <span>${this.formatBytes(size)}</span>
                        </div>`
                    ).join('')}
                </div>
            </div>
        `;
        
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);
        modal.style.display = 'block';

        // 关闭模态框
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            document.body.removeChild(modal);
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                document.body.removeChild(modal);
            }
        };
    }

    createModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        return modal;
    }

    exportCsv() {
        if (!this.results) return;

        const header = ['模块', '总大小(字节)', ...this.sections];
        const rows = [header];

        this.results.forEach(item => {
            const row = [item.module, item.total];
            this.sections.forEach(section => {
                row.push(item.sections[section] || 0);
            });
            rows.push(row);
        });

        const csvContent = rows.map(row => 
            row.map(cell => `"${cell}"`).join(',')
        ).join('\n');

        this.downloadFile(csvContent, 'map_analysis.csv', 'text/csv');
    }

    exportTxt() {
        if (!this.results) return;

        let content = '内存分析报告\n';
        content += '='.repeat(50) + '\n\n';
        content += `总模块数: ${this.results.length}\n`;
        content += `总内存占用: ${this.formatBytes(this.results.reduce((sum, item) => sum + item.total, 0))}\n`;
        content += `段类型数: ${this.sections.length}\n\n`;

        this.results.forEach((item, index) => {
            content += `${index + 1}. 模块: ${item.module}\n`;
            content += `   总大小: ${this.formatBytes(item.total)}\n`;
            Object.entries(item.sections).forEach(([section, size]) => {
                content += `     ${section}: ${this.formatBytes(size)}\n`;
            });
            content += '\n';
        });

        this.downloadFile(content, 'map_analysis.txt', 'text/plain');
    }

    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    truncateText(text, maxLength) {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    generateColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            const hue = (i * 360 / count) % 360;
            colors.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colors;
    }

    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
        document.getElementById('results').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('results').classList.add('hidden');
    }

    hideError() {
        document.getElementById('error').classList.add('hidden');
    }
}

// 初始化分析器
const analyzer = new MapAnalyzer();