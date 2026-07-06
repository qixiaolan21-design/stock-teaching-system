/**
 * 股票教学案例管理系统 - 完整版
 * 为YouTube主播运营团队设计
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const JSZip = require('jszip');
const fs = require('fs');
const DocumentParser = require('./documentParser');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 确保目录存在
['uploads', 'data'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// 内存数据库
const db = {
    cases: [],
    evidence: [],
    feedback: [],
    videos: [],
    documents: [],
    nasdaq: [],
    stockPrices: {}
};

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random()*1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

const parser = new DocumentParser();

// 初始化演示数据
function initDemoData() {
    const today = new Date();
    for (let i = 90; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const base = 14000 + Math.sin(i/15) * 1500 + (Math.random() - 0.5) * 300;
        db.nasdaq.push({
            date: date.toISOString().split('T')[0],
            open: +(base + (Math.random()-0.5)*100).toFixed(2),
            high: +(base + Math.random()*150).toFixed(2),
            low: +(base - Math.random()*150).toFixed(2),
            close: +base.toFixed(2),
            volume: Math.floor(Math.random() * 5000000)
        });
    }
}
initDemoData();

// ========== API 路由 ==========

app.get('/api/stats', (req, res) => {
    res.json({
        caseCount: db.cases.length,
        evidenceCount: db.evidence.length,
        feedbackCount: db.feedback.length,
        videoCount: db.videos.length,
        documentCount: db.documents.length
    });
});

// ========== 1. 文档上传 - 案例记录 ==========

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有上传文件' });
        
        const { originalname, filename, path: filePath } = req.file;
        const ext = path.extname(originalname).toLowerCase();
        
        console.log('上传文件:', originalname, '类型:', ext);
        
        // 提取文本
        let text = '';
        
        if (ext === '.txt' || ext === '.csv') {
            text = fs.readFileSync(filePath, 'utf-8');
        } else if (ext === '.pptx' || ext === '.docx') {
            text = await extractOfficeText(filePath, ext);
        } else if (ext === '.pdf') {
            try {
                text = fs.readFileSync(filePath, 'utf-8');
            } catch (e) {
                text = extractBinaryText(fs.readFileSync(filePath));
            }
        } else {
            text = extractBinaryText(fs.readFileSync(filePath));
        }
        
        console.log('提取文本长度:', text.length);
        console.log('文本前500字符:', text.substring(0, 500));
        
        // 解析股票信息
        const parseResult = parser.extractStockInfo(text, originalname);
        
        // 保存文档记录
        const docId = Date.now();
        db.documents.push({
            id: docId,
            filename,
            original_name: originalname,
            file_type: ext,
            upload_date: new Date().toISOString(),
            extracted_text: text.substring(0, 5000),
            stock_count: parseResult.stocks.length
        });
        
        // 添加到案例库
        const today = new Date().toISOString().split('T')[0];
        let addedCount = 0;
        
        for (const stock of parseResult.stocks) {
            const exists = db.cases.find(c => 
                c.stock_code === stock.stock_code && c.date === today
            );
            if (!exists) {
                db.cases.push({
                    id: Date.now() + addedCount,
                    date: today,
                    ...stock,
                    source_doc: originalname
                });
                addedCount++;
            }
        }
        
        res.json({
            success: true,
            documentId: docId,
            filename: originalname,
            fileType: ext,
            parsed: parseResult,
            addedToCases: addedCount,
            preview: text.substring(0, 1000)
        });
        
    } catch (error) {
        console.error('解析文档失败:', error);
        res.status(500).json({ error: '解析失败: ' + error.message });
    }
});

// 提取Office文档文本
async function extractOfficeText(filePath, ext) {
    try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        let text = '';
        
        if (ext === '.pptx') {
            // PPTX: 提取所有幻灯片文本
            const slideFiles = Object.keys(zip.files).filter(f => 
                f.startsWith('ppt/slides/slide') && f.endsWith('.xml')
            );
            
            console.log(`找到 ${slideFiles.length} 页幻灯片`);
            
            for (const slideFile of slideFiles.sort()) {
                try {
                    const content = await zip.files[slideFile].async('text');
                    const pageNum = slideFile.match(/slide(\d+)\.xml/)?.[1] || '?';
                    
                    // 提取 <a:t> 标签文本
                    const textMatches = content.match(/<a:t>([^<]+)<\/a:t>/g);
                    if (textMatches && textMatches.length > 0) {
                        const slideText = textMatches
                            .map(m => m.replace(/<\/?a:t>/g, ''))
                            .join(' ');
                        text += `[第${pageNum}页] ${slideText}\n`;
                    }
                } catch (e) {
                    console.error(`解析 ${slideFile} 失败:`, e.message);
                }
            }
        } else if (ext === '.docx') {
            // DOCX: 提取文档文本
            const docXml = zip.files['word/document.xml'];
            if (docXml) {
                const content = await docXml.async('text');
                const matches = content.match(/<w:t>([^<]+)<\/w:t>/g);
                if (matches) {
                    text = matches.map(m => m.replace(/<\/?w:t>/g, '')).join(' ');
                }
            }
        }
        
        return text;
    } catch (e) {
        console.error('Office提取失败:', e);
        return extractBinaryText(fs.readFileSync(filePath));
    }
}

// 从二进制提取可读文本
function extractBinaryText(buffer) {
    let text = '';
    const str = buffer.toString('utf-8');
    
    // 提取中文字符
    const chineseMatches = str.match(/[\u4e00-\u9fa5]{2,}/g);
    if (chineseMatches) text += chineseMatches.join(' ');
    
    // 提取股票代码（6位数字）
    const stockMatches = str.match(/\d{6}/g);
    if (stockMatches) text += ' ' + stockMatches.join(' ');
    
    return text;
}

// 获取案例列表
app.get('/api/cases', (req, res) => {
    let result = [...db.cases];
    if (req.query.date) result = result.filter(c => c.date === req.query.date);
    if (req.query.stock) result = result.filter(c => c.stock_code === req.query.stock);
    res.json({ cases: result.sort((a, b) => b.id - a.id) });
});

// ========== 2. 印证案例库 - PPT课件管理 ==========

app.post('/api/evidence/upload', upload.single('ppt'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有上传PPT' });
        
        const { originalname, filename, path: filePath } = req.file;
        
        // 提取PPT所有页面
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        const slides = [];
        
        const slideFiles = Object.keys(zip.files)
            .filter(f => f.match(/ppt\/slides\/slide\d+\.xml/))
            .sort();
        
        for (const slideFile of slideFiles) {
            const content = await zip.files[slideFile].async('text');
            const textMatches = content.match(/<a:t>([^<]+)<\/a:t>/g);
            const slideText = textMatches ? 
                textMatches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ') : '';
            
            const pageNum = parseInt(slideFile.match(/slide(\d+)/)[1]);
            const stocks = parser.extractStockInfo(slideText);
            
            slides.push({
                page: pageNum,
                text: slideText.substring(0, 500),
                stocks: stocks.stocks,
                preview: slideText.substring(0, 200)
            });
        }
        
        res.json({
            success: true,
            filename: originalname,
            totalSlides: slides.length,
            slides: slides
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 保存印证案例
app.post('/api/evidence', (req, res) => {
    const data = { 
        id: Date.now(), 
        created_at: new Date().toISOString(),
        ...req.body 
    };
    db.evidence.push(data);
    res.json({ success: true, id: data.id });
});

// 搜索印证案例
app.get('/api/evidence', (req, res) => {
    let result = [...db.evidence];
    
    if (req.query.tag) {
        const tag = req.query.tag.toLowerCase();
        result = result.filter(e => 
            (e.evidence_type && e.evidence_type.toLowerCase().includes(tag)) ||
            (e.tags && e.tags.some(t => t.toLowerCase().includes(tag)))
        );
    }
    
    if (req.query.stock) {
        result = result.filter(e => e.stock_code === req.query.stock);
    }
    
    res.json({ evidence: result.sort((a, b) => b.id - a.id) });
});

// ========== 3. 会员反馈 ==========

app.post('/api/feedback', upload.single('screenshot'), (req, res) => {
    const data = {
        id: Date.now(),
        created_at: new Date().toISOString(),
        ...req.body,
        screenshot: req.file ? req.file.filename : null
    };
    db.feedback.push(data);
    res.json({ success: true, id: data.id });
});

app.get('/api/feedback', (req, res) => {
    let result = [...db.feedback];
    if (req.query.method) {
        result = result.filter(f => 
            f.method_tags && f.method_tags.includes(req.query.method)
        );
    }
    res.json({ feedback: result.sort((a, b) => b.id - a.id) });
});

// ========== 4. 图表展示 ==========

app.get('/api/chart/data', (req, res) => {
    const caseByDate = {};
    db.cases.forEach(c => {
        if (!caseByDate[c.date]) caseByDate[c.date] = [];
        caseByDate[c.date].push(c.stock_code);
    });
    
    const evidenceByDate = {};
    db.evidence.forEach(e => {
        if (!evidenceByDate[e.date]) evidenceByDate[e.date] = 0;
        evidenceByDate[e.date]++;
    });
    
    res.json({ nasdaq: db.nasdaq, cases: caseByDate, evidence: evidenceByDate });
});

// ========== 5. 股票验证 ==========

app.get('/api/stock/verify/:code', async (req, res) => {
    const { code } = req.params;
    res.json({
        stock_code: code,
        current_price: (Math.random() * 100 + 10).toFixed(2),
        change_percent: (Math.random() * 20 - 10).toFixed(2),
        verified_at: new Date().toISOString(),
        note: '此为模拟数据，实际应接入股票API'
    });
});

app.post('/api/stock/verify-batch', async (req, res) => {
    const { codes } = req.body;
    const results = codes.map(code => ({
        stock_code: code,
        current_price: (Math.random() * 100 + 10).toFixed(2),
        change_percent: (Math.random() * 20 - 10).toFixed(2),
        trend: Math.random() > 0.5 ? 'up' : 'down'
    }));
    res.json({ results });
});

// 页面路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('  股票教学案例管理系统 - YouTube主播运营版');
    console.log('='.repeat(60));
    console.log(`  🚀 服务已启动: http://localhost:${PORT}`);
    console.log('='.repeat(60));
});
