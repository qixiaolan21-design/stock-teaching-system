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

// 内存数据库（生产环境应使用真实数据库）
const db = {
    cases: [],           // 案例记录
    evidence: [],        // 印证案例
    feedback: [],        // 会员反馈
    videos: [],          // 视频记录
    documents: [],       // 上传的文档
    nasdaq: [],          // 纳指数据
    stockPrices: {}      // 股票价格缓存
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

// ========== 初始化演示数据 ==========
function initDemoData() {
    // 纳指数据
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

// 统计
app.get('/api/stats', (req, res) => {
    res.json({
        caseCount: db.cases.length,
        evidenceCount: db.evidence.length,
        feedbackCount: db.feedback.length,
        videoCount: db.videos.length,
        documentCount: db.documents.length
    });
});

// ========== 1. 案例记录 - 文档上传自动提取 ==========

app.post('/api/documents/upload', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有上传文件' });
        
        const { originalname, filename, path: filePath } = req.file;
        const ext = path.extname(originalname).toLowerCase();
        
        // 提取文本
        let text = '';
        if (ext === '.pptx' || ext === '.docx') {
            text = await extractOfficeText(filePath, ext);
        } else {
            text = fs.readFileSync(filePath, 'utf-8');
        }
        
        // 解析股票信息
        const parseResult = parser.extractStockInfo(text, originalname);
        
        // 保存文档记录
        const docId = Date.now();
        db.documents.push({
            id: docId,
            filename,
            original_name: originalname,
            upload_date: new Date().toISOString(),
            stock_count: parseResult.stocks.length,
            preview: text.substring(0, 1000)
        });
        
        // 添加到案例库
        const today = new Date().toISOString().split('T')[0];
        parseResult.stocks.forEach((stock, i) => {
            if (!db.cases.find(c => c.stock_code === stock.stock_code && c.date === today)) {
                db.cases.push({
                    id: Date.now() + i,
                    date: today,
                    ...stock,
                    source_type: 'document',
                    source_name: originalname
                });
            }
        });
        
        res.json({
            success: true,
            documentId: docId,
            filename: originalname,
            parsed: parseResult,
            addedCount: parseResult.stocks.length
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 提取Office文档文本
async function extractOfficeText(filePath, ext) {
    try {
        const data = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(data);
        let text = '';
        
        if (ext === '.pptx') {
            // 提取所有幻灯片
            const slides = Object.keys(zip.files).filter(f => 
                f.match(/ppt\/slides\/slide\d+\.xml/)
            );
            for (const slide of slides.sort()) {
                const content = await zip.files[slide].async('text');
                const matches = content.match(/<a:t>([^<]+)<\/a:t>/g);
                if (matches) {
                    text += `[第${slide.match(/slide(\d+)/)[1]}页] `;
                    text += matches.map(m => m.replace(/<\/?a:t>/g, '')).join(' ') + '\n';
                }
            }
        } else if (ext === '.docx') {
            const docXml = zip.files['word/document.xml'];
            if (docXml) {
                const content = await docXml.async('text');
                const matches = content.match(/<w:t>([^<]+)<\/w:t>/g);
                if (matches) text = matches.map(m => m.replace(/<\/?w:t>/g, '')).join(' ');
            }
        }
        return text;
    } catch (e) {
        return fs.readFileSync(filePath, 'utf-8');
    }
}

// 获取案例列表
app.get('/api/cases', (req, res) => {
    let result = [...db.cases];
    if (req.query.date) result = result.filter(c => c.date === req.query.date);
    if (req.query.stock) result = result.filter(c => c.stock_code === req.query.stock);
    res.json({ cases: result.sort((a, b) => b.id - a.id) });
});

// ========== 2. 印证案例库 - PPT课件管理 ==========

// 上传PPT作为印证案例
app.post('/api/evidence/upload', upload.single('ppt'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '没有上传PPT' });
        
        const { originalname, filename, path: filePath } = req.file;
        
        // 提取PPT所有页面文本
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
            
            // 解析每页的股票
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

// ========== 4. 图表展示 - 纳指K线 ==========

app.get('/api/chart/data', (req, res) => {
    // 整理案例数据按日期
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
    
    res.json({
        nasdaq: db.nasdaq,
        cases: caseByDate,
        evidence: evidenceByDate
    });
});

// ========== 5. 股票验证（高级功能） ==========

// 模拟股票验证（实际应接入真实API）
app.get('/api/stock/verify/:code', async (req, res) => {
    const { code } = req.params;
    
    // 这里应该接入真实股票API
    // 模拟返回
    res.json({
        stock_code: code,
        current_price: (Math.random() * 100 + 10).toFixed(2),
        change_percent: (Math.random() * 20 - 10).toFixed(2),
        verified_at: new Date().toISOString(),
        note: '此为模拟数据，实际应接入股票API'
    });
});

// 批量验证
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
