/**
 * 股票教学案例管理系统 - 前端逻辑
 */

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('fb-date').value = today;
    
    updateStats();
    loadCases();
    loadEvidence();
    loadFeedback();
    initDropZones();
});

// 显示页面
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('bg-blue-50', 'text-blue-600');
        n.classList.add('text-gray-700');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('bg-blue-50', 'text-blue-600');
    
    if (sectionId === 'chart') setTimeout(loadChart, 100);
}

// 初始化拖拽区域
function initDropZones() {
    ['drop-zone-doc', 'drop-zone-ppt'].forEach(id => {
        const zone = document.getElementById(id);
        if (!zone) return;
        
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('dragover');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) {
                if (id === 'drop-zone-doc') uploadDocument({ files: [files[0]] });
                if (id === 'drop-zone-ppt') uploadPPT({ files: [files[0]] });
            }
        });
    });
}

// 更新统计
async function updateStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        document.getElementById('stat-cases').textContent = data.caseCount;
        document.getElementById('stat-evidence').textContent = data.evidenceCount;
        document.getElementById('stat-feedback').textContent = data.feedbackCount;
        document.getElementById('stat-videos').textContent = data.videoCount;
    } catch (e) { console.error('统计加载失败:', e); }
}

// ========== 1. 文档上传 - 案例记录 ==========
async function uploadDocument(input) {
    const file = input.files ? input.files[0] : input;
    if (!file) return;
    
    const formData = new FormData();
    formData.append('document', file);
    
    const zone = document.getElementById('drop-zone-doc');
    zone.innerHTML = '<p class="text-lg text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>正在解析文档...</p>';
    
    try {
        const res = await fetch('/api/documents/upload', { method: 'POST', body: formData });
        const result = await res.json();
        
        if (result.success) {
            showDocResult(result);
            updateStats();
            loadCases();
        }
    } catch (e) {
        alert('上传失败: ' + e);
    } finally {
        zone.innerHTML = `
            <i class="fas fa-cloud-upload-alt text-5xl text-gray-400 mb-4"></i>
            <p class="text-lg text-gray-600 mb-2">拖拽文档到此处，或点击上传</p>
            <p class="text-sm text-gray-400">支持 Word (.docx)、PDF (.pdf)、文本 (.txt)</p>
        `;
    }
}

function showDocResult(result) {
    document.getElementById('doc-result').classList.remove('hidden');
    document.getElementById('doc-summary').innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-green-700"><i class="fas fa-check-circle mr-2"></i>${result.parsed.summary}</p>
            <p class="text-sm text-green-600 mt-1">已自动添加 ${result.addedCount} 只股票到案例库</p>
        </div>
    `;
    
    if (result.parsed.stocks.length === 0) {
        document.getElementById('doc-stocks').innerHTML = '<p class="text-gray-400">未检测到股票信息</p>';
        return;
    }
    
    document.getElementById('doc-stocks').innerHTML = result.parsed.stocks.map(s => `
        <div class="border rounded-lg p-4 bg-gray-50">
            <div class="flex items-center justify-between mb-2">
                <span class="font-bold text-lg">${s.stock_name || s.stock_code} (${s.stock_code})</span>
                ${s.evidence_type ? `<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm">${s.evidence_type}</span>` : ''}
            </div>
            ${s.pressure_points.length ? `<p class="text-sm text-red-600">📈 压力: ${s.pressure_points.join(', ')}</p>` : ''}
            ${s.support_points.length ? `<p class="text-sm text-green-600">📉 支撑: ${s.support_points.join(', ')}</p>` : ''}
            ${s.risk_points.length ? `<p class="text-sm text-orange-600">⚠️ 风险: ${s.risk_points.join('; ')}</p>` : ''}
            ${s.opportunity_points.length ? `<p class="text-sm text-blue-600">💡 机会: ${s.opportunity_points.join('; ')}</p>` : ''}
        </div>
    `).join('');
}

async function loadCases() {
    try {
        const res = await fetch('/api/cases');
        const data = await res.json();
        const container = document.getElementById('cases-list');
        
        if (data.cases.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">暂无案例记录</p>';
            return;
        }
        
        container.innerHTML = data.cases.slice(0, 20).map(c => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${c.stock_name || c.stock_code}</span>
                        <span class="text-gray-400">(${c.stock_code})</span>
                        <span class="text-gray-400 ml-2">${c.date}</span>
                    </div>
                    ${c.source_name ? `<span class="text-xs text-gray-400">${c.source_name}</span>` : ''}
                </div>
                <div class="mt-2 text-sm">
                    ${c.pressure_points?.length ? `<span class="text-red-600 mr-3">压力: ${c.pressure_points.join(', ')}</span>` : ''}
                    ${c.support_points?.length ? `<span class="text-green-600">支撑: ${c.support_points.join(', ')}</span>` : ''}
                </div>
            </div>
        `).join('');
    } catch (e) { console.error('加载案例失败:', e); }
}

// ========== 2. PPT上传 - 印证案例库 ==========
async function uploadPPT(input) {
    const file = input.files ? input.files[0] : input;
    if (!file) return;
    
    const formData = new FormData();
    formData.append('ppt', file);
    
    const zone = document.getElementById('drop-zone-ppt');
    zone.innerHTML = '<p class="text-lg text-blue-600"><i class="fas fa-spinner fa-spin mr-2"></i>正在解析PPT...</p>';
    
    try {
        const res = await fetch('/api/evidence/upload', { method: 'POST', body: formData });
        const result = await res.json();
        
        if (result.success) {
            showPPTResult(result);
        }
    } catch (e) {
        alert('PPT解析失败: ' + e);
    } finally {
        zone.innerHTML = `
            <i class="fas fa-file-powerpoint text-5xl text-orange-400 mb-4"></i>
            <p class="text-lg text-gray-600 mb-2">拖拽PPT课件到此处，或点击上传</p>
            <p class="text-sm text-gray-400">支持 PowerPoint (.pptx)</p>
        `;
    }
}

function showPPTResult(result) {
    document.getElementById('ppt-result').classList.remove('hidden');
    document.getElementById('ppt-info').innerHTML = `
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p class="text-orange-700"><i class="fas fa-file-powerpoint mr-2"></i>${result.filename}</p>
            <p class="text-sm text-orange-600 mt-1">共 ${result.totalSlides} 页，检测到股票信息的页面已标记</p>
        </div>
    `;
    
    document.getElementById('ppt-slides').innerHTML = result.slides.map(s => `
        <div class="slide-preview rounded-lg p-4 ${s.stocks.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}">
            <div class="flex items-center justify-between mb-2">
                <span class="font-semibold">第 ${s.page} 页</span>
                ${s.stocks.length > 0 ? `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">${s.stocks.length} 只股票</span>` : ''}
            </div>
            <p class="text-sm text-gray-600 line-clamp-3">${s.preview}</p>
            ${s.stocks.length > 0 ? `
                <div class="mt-2">
                    ${s.stocks.map(stock => `
                        <button onclick="addToEvidence(${s.page}, '${stock.stock_code}', '${stock.stock_name}')" 
                            class="text-xs bg-blue-600 text-white px-2 py-1 rounded mr-1 hover:bg-blue-700">
                            + ${stock.stock_code}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');
}

// 添加到印证案例库
async function addToEvidence(page, code, name) {
    const type = prompt('选择印证类型：\n1. 筹码\n2. 机构DC\n3. 密码\n4. 趋势\n5. 量能\n6. K线\n7. 支撑压力\n8. 均线', '筹码');
    if (!type) return;
    
    const tags = prompt('输入标签（用逗号分隔）：', '');
    
    try {
        const res = await fetch('/api/evidence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: new Date().toISOString().split('T')[0],
                stock_code: code,
                stock_name: name,
                evidence_type: type,
                tags: tags ? tags.split(',').map(t => t.trim()) : [],
                ppt_page: page,
                description: `PPT第${page}页`
            })
        });
        
        if ((await res.json()).success) {
            alert('已添加到印证案例库！');
            updateStats();
        }
    } catch (e) { alert('添加失败: ' + e); }
}

// ========== 印证案例检索 ==========
async function searchEvidence() {
    const query = document.getElementById('search-input').value;
    await performSearch(query);
}

function quickSearch(tag) {
    document.getElementById('search-input').value = tag;
    performSearch(tag);
}

async function performSearch(query) {
    try {
        const res = await fetch(`/api/evidence?tag=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        const container = document.getElementById('evidence-list');
        if (data.evidence.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">未找到相关案例</p>';
            return;
        }
        
        const typeColors = {
            '筹码': 'bg-blue-100 text-blue-700',
            '机构DC': 'bg-purple-100 text-purple-700',
            '密码': 'bg-orange-100 text-orange-700',
            '趋势': 'bg-green-100 text-green-700',
            '量能': 'bg-pink-100 text-pink-700',
            'K线': 'bg-yellow-100 text-yellow-700'
        };
        
        container.innerHTML = data.evidence.map(e => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold">${e.stock_name || e.stock_code}</span>
                        <span class="text-gray-400">(${e.stock_code})</span>
                        <span class="text-gray-400 ml-2">${e.date}</span>
                    </div>
                    ${e.evidence_type ? `<span class="px-2 py-1 rounded text-sm ${typeColors[e.evidence_type] || 'bg-gray-100'}">${e.evidence_type}</span>` : ''}
                </div>
                ${e.ppt_page ? `<p class="text-sm text-blue-600 mt-1">📄 PPT第${e.ppt_page}页</p>` : ''}
                ${e.tags?.length ? `<div class="mt-2">${e.tags.map(t => `<span class="px-2 py-1 bg-gray-100 rounded text-xs mr-1">${t}</span>`).join('')}</div>` : ''}
                ${e.description ? `<p class="text-sm text-gray-600 mt-2">${e.description}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('搜索失败:', e); }
}

async function loadEvidence() {
    await performSearch('');
}

// ========== 3. 会员反馈 ==========
async function addFeedback() {
    const methods = Array.from(document.querySelectorAll('.fb-method:checked')).map(cb => cb.value);
    
    const data = {
        date: document.getElementById('fb-date').value,
        member_name: document.getElementById('fb-member').value,
        stock_code: document.getElementById('fb-stock').value,
        profit_amount: parseFloat(document.getElementById('fb-profit').value) || 0,
        method_tags: methods,
        description: document.getElementById('fb-desc').value
    };
    
    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if ((await res.json()).success) {
            alert('反馈已保存！');
            document.getElementById('fb-member').value = '';
            document.getElementById('fb-stock').value = '';
            document.getElementById('fb-profit').value = '';
            document.getElementById('fb-desc').value = '';
            document.querySelectorAll('.fb-method').forEach(cb => cb.checked = false);
            loadFeedback();
            updateStats();
        }
    } catch (e) { alert('保存失败: ' + e); }
}

async function loadFeedback() {
    try {
        const res = await fetch('/api/feedback');
        const data = await res.json();
        const container = document.getElementById('feedback-list');
        
        if (data.feedback.length === 0) {
            container.innerHTML = '<p class="text-gray-400 text-center py-8">暂无反馈</p>';
            return;
        }
        
        container.innerHTML = data.feedback.slice(0, 20).map(f => `
            <div class="border rounded-lg p-4 hover:shadow-md transition-all">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-semibold">${f.member_name || '匿名'}</span>
                        <span class="text-gray-400 ml-2">${f.date}</span>
                        ${f.stock_code ? `<span class="text-gray-500 ml-2">(${f.stock_code})</span>` : ''}
                    </div>
                    ${f.profit_amount ? `<span class="text-green-600 font-bold">+${f.profit_amount.toLocaleString()}</span>` : ''}
                </div>
                ${f.method_tags?.length ? `<div class="mt-2">${f.method_tags.map(t => `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs mr-1">${t}</span>`).join('')}</div>` : ''}
                ${f.description ? `<p class="text-sm text-gray-600 mt-2">${f.description}</p>` : ''}
            </div>
        `).join('');
    } catch (e) { console.error('加载反馈失败:', e); }
}

// ========== 4. 图表展示 ==========
let chart = null;
async function loadChart() {
    try {
        const res = await fetch('/api/chart/data');
        const data = await res.json();
        
        if (!chart) chart = echarts.init(document.getElementById('chart-container'));
        
        const dates = data.nasdaq.map(d => d.date);
        const prices = data.nasdaq.map(d => [d.open, d.close, d.low, d.high]);
        
        // 标记案例日期
        const caseMarks = Object.entries(data.cases).map(([date, info]) => ({
            name: '案例',
            value: [date, data.nasdaq.find(n => n.date === date)?.close || 0],
            stocks: info.stocks,
            count: info.count
        }));
        
        const option = {
            title: { text: '纳指走势与教学案例', left: 'center' },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: function(params) {
                    let html = params[0].axisValue + '<br/>';
                    if (params[0].seriesName === '纳指') {
                        const d = params[0].data;
                        html += `开盘: ${d[1]}<br/>收盘: ${d[2]}<br/>最低: ${d[3]}<br/>最高: ${d[4]}`;
                    }
                    if (params[1]) {
                        html += `<br/>📚 当天讲了 ${params[1].data.count} 只股票`;
                    }
                    return html;
                }
            },
            legend: { data: ['纳指', '教学案例'], top: 30 },
            xAxis: { type: 'category', data: dates, scale: true },
            yAxis: { scale: true },
            dataZoom: [{ type: 'inside', start: 50, end: 100 }, { type: 'slider', top: '92%', start: 50, end: 100 }],
            series: [
                { name: '纳指', type: 'candlestick', data: prices, itemStyle: { color: '#ef232a', color0: '#14b143' } },
                { name: '教学案例', type: 'scatter', data: caseMarks, symbolSize: 12, itemStyle: { color: '#3b82f6' } }
            ]
        };
        
        chart.setOption(option);
    } catch (e) { console.error('加载图表失败:', e); }
}

async function generateDemo() {
    await fetch('/api/demo/generate', { method: 'POST' });
    alert('演示数据已生成！');
    updateStats();
    loadChart();
}

// ========== 5. 股票验证 ==========
async function verifyStocks() {
    const codes = document.getElementById('verify-codes').value
        .split('\n')
        .map(c => c.trim())
        .filter(c => c);
    
    if (codes.length === 0) {
        alert('请输入股票代码');
        return;
    }
    
    document.getElementById('verify-result').classList.remove('hidden');
    document.getElementById('verify-list').innerHTML = '<p class="text-center"><i class="fas fa-spinner fa-spin mr-2"></i>正在验证...</p>';
    
    try {
        const res = await fetch('/api/stock/verify-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codes })
        });
        
        const data = await res.json();
        
        document.getElementById('verify-list').innerHTML = data.results.map(r => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                    <span class="font-semibold">${r.stock_code}</span>
                    <span class="text-gray-400 ml-2">当前: ${r.current_price}</span>
                </div>
                <span class="${r.change_percent > 0 ? 'text-red-600' : 'text-green-600'} font-bold">
                    ${r.change_percent > 0 ? '📈 +' : '📉 '}${r.change_percent}%
                </span>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('verify-list').innerHTML = '<p class="text-red-600">验证失败: ' + e + '</p>';
    }
}
