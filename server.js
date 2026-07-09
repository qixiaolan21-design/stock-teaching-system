const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 配置 - 允许所有域名访问
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// 数据文件路径
// 使用 Render Disk 或本地目录
const DATA_DIR = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'data')
    : path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.RENDER_DISK_PATH
    ? path.join(process.env.RENDER_DISK_PATH, 'uploads')
    : path.join(__dirname, 'uploads');
const CASES_FILE = path.join(DATA_DIR, 'cases.json');
const PPT_LIBRARY_FILE = path.join(DATA_DIR, 'ppt_library.json');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
            file.mimetype === 'application/vnd.ms-powerpoint' ||
            file.originalname.endsWith('.pptx') ||
            file.originalname.endsWith('.ppt')) {
            cb(null, true);
        } else {
            cb(new Error('只支持 PPT/PPTX 文件'));
        }
    }
});

// 初始化数据文件
function initDataFile(filePath, defaultData = []) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
}

initDataFile(CASES_FILE);
initDataFile(PPT_LIBRARY_FILE);
initDataFile(FEEDBACK_FILE);

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 获取所有数据
app.get('/api/data', (req, res) => {
    try {
        const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8'));
        const pptLibrary = JSON.parse(fs.readFileSync(PPT_LIBRARY_FILE, 'utf-8'));
        const feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        
        res.json({ cases, pptLibrary, feedback });
    } catch (err) {
        res.status(500).json({ error: '读取数据失败' });
    }
});

// 保存案例
app.post('/api/cases', (req, res) => {
    try {
        const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8'));
        const newCase = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        cases.push(newCase);
        fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
        res.json({ success: true, data: newCase });
    } catch (err) {
        res.status(500).json({ error: '保存失败' });
    }
});

// 更新案例
app.put('/api/cases/:id', (req, res) => {
    try {
        let cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8'));
        const index = cases.findIndex(c => c.id === req.params.id);
        if (index === -1) {
            return res.status(404).json({ error: '案例不存在' });
        }
        cases[index] = { ...cases[index], ...req.body, updatedAt: new Date().toISOString() };
        fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
        res.json({ success: true, data: cases[index] });
    } catch (err) {
        res.status(500).json({ error: '更新失败' });
    }
});

// 删除案例
app.delete('/api/cases/:id', (req, res) => {
    try {
        let cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf-8'));
        cases = cases.filter(c => c.id !== req.params.id);
        fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '删除失败' });
    }
});

// 保存反馈
app.post('/api/feedback', (req, res) => {
    try {
        const feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        const newFeedback = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        feedback.push(newFeedback);
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
        res.json({ success: true, data: newFeedback });
    } catch (err) {
        res.status(500).json({ error: '保存失败' });
    }
});

// 删除反馈
app.delete('/api/feedback/:id', (req, res) => {
    try {
        let feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
        feedback = feedback.filter(f => f.id !== req.params.id);
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '删除失败' });
    }
});

// 导入数据
app.post('/api/import', (req, res) => {
    try {
        const { cases, pptLibrary, feedback } = req.body;
        if (cases) fs.writeFileSync(CASES_FILE, JSON.stringify(cases, null, 2));
        if (pptLibrary) fs.writeFileSync(PPT_LIBRARY_FILE, JSON.stringify(pptLibrary, null, 2));
        if (feedback) fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '导入失败' });
    }
});

// 智能分析图片是否包含K线图特征
function analyzeImageForStockChart(imageBuffer, fileName) {
    // 检查图片文件名是否包含股票相关关键词
    const stockKeywords = ['chart', 'kline', 'candle', 'stock', 'price', 'trend', 'analysis', 'graph', '走势', 'K线', '图表'];
    const hasKeyword = stockKeywords.some(kw => fileName.toLowerCase().includes(kw.toLowerCase()));
    
    // 检查图片大小（K线图通常较大，但不超过一定范围）
    const size = imageBuffer.length;
    const isGoodSize = size > 30000 && size < 2000000; // 30KB - 2MB
    
    // 简单的评分系统
    let score = 0;
    if (isGoodSize) score += 20;
    if (hasKeyword) score += 10;
    if (size > 100000) score += 10; // 大于100KB加分
    
    // 返回分析结果
    return {
        isLikelyStockChart: score >= 20,
        confidence: score,
        reason: isGoodSize ? '图片尺寸符合K线图特征' : '图片尺寸不合适'
    };
}

// 从PPT的 notesSlide 或 slide XML 中提取文本
function extractSlideText(pptxPath, slideNumber) {
    const texts = [];
    try {
        const zip = new AdmZip(pptxPath);
        
        // 尝试读取 slide 的 notes
        const notesPath = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
        const notesEntry = zip.getEntry(notesPath);
        
        if (notesEntry) {
            const notesContent = notesEntry.getData().toString('utf8');
            // 提取文本内容（简单的正则提取）
            const textMatches = notesContent.match(/<a:t>([^<]+)<\/a:t>/g);
            if (textMatches) {
                textMatches.forEach(match => {
                    const text = match.replace(/<\/?a:t>/g, '');
                    if (text.trim()) texts.push(text.trim());
                });
            }
        }
        
        // 也尝试读取 slide 本身的文本
        const slidePath = `ppt/slides/slide${slideNumber}.xml`;
        const slideEntry = zip.getEntry(slidePath);
        
        if (slideEntry) {
            const slideContent = slideEntry.getData().toString('utf8');
            const textMatches = slideContent.match(/<a:t>([^<]+)<\/a:t>/g);
            if (textMatches) {
                textMatches.forEach(match => {
                    const text = match.replace(/<\/?a:t>/g, '');
                    if (text.trim() && text.length > 2) texts.push(text.trim());
                });
            }
        }
    } catch (err) {
        console.error('提取幻灯片文本失败:', err);
    }
    return texts;
}

// 从文本中提取股票信息
function extractStockInfoFromText(texts) {
    const allText = texts.join(' ');
    
    // 股票代码模式 (AAPL, MSFT, 00700, etc.)
    const stockCodePattern = /\b([A-Z]{1,5})\b|\b(\d{4,6})\b/g;
    
    // 股票名称模式（中文）
    const stockNamePattern = /([\u4e00-\u9fa5]{2,10})(?:股票|股份|集团|公司|科技|生物|医药|银行|保险|证券|基金|ETF|美股|港股|A股)/g;
    
    // 分析方法关键词
    const methodKeywords = {
        '支撑压力': ['支撑', '压力', '阻力位', '支撑位', '突破', '跌破'],
        '筹码分析': ['筹码', '主力', '散户', '成本', '集中', '分散'],
        '机构DeepChart': ['机构', 'DC', 'DeepChart', '大单', '资金流向'],
        'AI赢家K线': ['AI赢家', 'K线密码', '赢家', '信号', '买入', '卖出'],
        '飘带': ['飘带', '趋势', '多空', '红飘带', '绿飘带'],
        '量能': ['量能', '成交量', '放量', '缩量', '天量', '地量'],
        '趋势': ['趋势', '上涨', '下跌', '震荡', '盘整', '突破']
    };
    
    const stocks = [];
    const methods = [];
    
    // 提取股票代码
    let match;
    const foundCodes = new Set();
    while ((match = stockCodePattern.exec(allText)) !== null) {
        const code = match[1] || match[2];
        if (code && !foundCodes.has(code)) {
            foundCodes.add(code);
            stocks.push({
                code: code,
                name: null, // 暂时无法确定名称
                type: /^[A-Z]+$/.test(code) ? '美股' : '港股/A股'
            });
        }
    }
    
    // 提取分析方法
    for (const [method, keywords] of Object.entries(methodKeywords)) {
        for (const keyword of keywords) {
            if (allText.includes(keyword)) {
                if (!methods.includes(method)) {
                    methods.push(method);
                }
                break;
            }
        }
    }
    
    // 提取价格信息
    const pricePattern = /(\d+\.?\d*)\s*(美元|刀|\$|元|港币|港元)/g;
    const prices = [];
    while ((match = pricePattern.exec(allText)) !== null) {
        prices.push({
            value: match[1],
            currency: match[2]
        });
    }
    
    return {
        stocks: stocks.slice(0, 5), // 最多5个股票
        methods: methods,
        prices: prices.slice(0, 3), // 最多3个价格
        rawText: allText.substring(0, 500) // 原始文本前500字符
    };
}

// 提取PPT中的图片（智能筛选K线图）
function extractPptImages(pptxPath, outputDir) {
    const slides = [];
    const extractedCases = [];
    
    try {
        const zip = new AdmZip(pptxPath);
        const zipEntries = zip.getEntries();
        
        // 收集所有图片
        const allImages = [];
        zipEntries.forEach(entry => {
            if (entry.entryName.startsWith('ppt/media/') && 
                (entry.entryName.endsWith('.png') || 
                 entry.entryName.endsWith('.jpg') || 
                 entry.entryName.endsWith('.jpeg'))) {
                
                allImages.push({
                    entryName: entry.entryName,
                    data: entry.getData()
                });
            }
        });
        
        console.log(`找到 ${allImages.length} 张图片，开始智能分析...`);
        
        // 分析每张图片（限制最多处理30张，避免性能问题）
        const maxImages = Math.min(allImages.length, 30);
        console.log(`找到 ${allImages.length} 张图片，将分析前 ${maxImages} 张...`);
        
        for (let index = 0; index < maxImages; index++) {
            const img = allImages[index];
            const slideNumber = index + 1;
            const ext = path.extname(img.entryName);
            const imageName = `slide-${slideNumber}${ext}`;
            const imagePath = path.join(outputDir, imageName);
            
            // 分析图片是否可能是K线图
            const analysis = analyzeImageForStockChart(img.data, img.entryName);
            
            // 只处理可能是K线图的页面，减少性能开销
            let slideTexts = [];
            let stockInfo = { stocks: [], methods: [], prices: [], rawText: '' };
            
            if (analysis.isLikelyStockChart) {
                // 提取幻灯片文本（仅对可能是K线图的页面）
                slideTexts = extractSlideText(pptxPath, slideNumber);
                stockInfo = extractStockInfoFromText(slideTexts);
            }
            
            // 保存图片
            fs.writeFileSync(imagePath, img.data);
            
            const slideData = {
                slideNumber: slideNumber,
                imageName: imageName,
                path: `/uploads/${path.basename(outputDir)}/${imageName}`,
                originalName: img.entryName,
                analysis: analysis,
                isStockChart: analysis.isLikelyStockChart || stockInfo.stocks.length > 0,
                extractedText: slideTexts.slice(0, 5), // 减少存储的文本量
                stockInfo: stockInfo
            };
            
            slides.push(slideData);
            
            // 如果识别出股票信息，自动创建案例候选
            if (stockInfo.stocks.length > 0 || stockInfo.methods.length > 0) {
                extractedCases.push({
                    slideNumber: slideNumber,
                    slideImage: slideData.path,
                    stocks: stockInfo.stocks,
                    methods: stockInfo.methods,
                    prices: stockInfo.prices,
                    confidence: analysis.confidence + (stockInfo.stocks.length * 20)
                });
            }
        }
        
        console.log(`分析完成，识别出 ${extractedCases.length} 个潜在案例`);
        
    } catch (err) {
        console.error('提取图片失败:', err);
    }
    
    return {
        slides: slides,
        extractedCases: extractedCases.sort((a, b) => b.confidence - a.confidence) // 按置信度排序
    };
}

// 上传PPT到PPT库（智能筛选K线图）
app.post('/api/ppt-library/upload', upload.single('pptFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '没有上传文件' });
        }

        const pptxPath = req.file.path;
        const fileId = path.basename(req.file.filename, path.extname(req.file.filename));
        const imagesDir = path.join(UPLOADS_DIR, fileId);
        
        // 创建图片存放目录
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        // 智能提取图片和案例
        const result = extractPptImages(pptxPath, imagesDir);
        
        // 过滤出可能是K线图的页面
        const stockChartSlides = result.slides.filter(s => s.isStockChart);

        res.json({
            success: true,
            fileId: fileId,
            originalName: req.file.originalname,
            slides: result.slides,
            stockChartSlides: stockChartSlides,
            extractedCases: result.extractedCases,
            slideCount: result.slides.length,
            stockChartCount: stockChartSlides.length,
            message: `共提取 ${result.slides.length} 页，识别出 ${stockChartSlides.length} 页可能包含K线图`
        });
    } catch (err) {
        console.error('上传处理失败:', err);
        res.status(500).json({ error: '处理失败: ' + err.message });
    }
});

// 保存PPT到PPT库
app.post('/api/ppt-library', (req, res) => {
    try {
        const library = JSON.parse(fs.readFileSync(PPT_LIBRARY_FILE, 'utf-8'));
        const newPpt = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        library.push(newPpt);
        fs.writeFileSync(PPT_LIBRARY_FILE, JSON.stringify(library, null, 2));
        res.json({ success: true, data: newPpt });
    } catch (err) {
        res.status(500).json({ error: '保存失败' });
    }
});

// 删除PPT库中的PPT
app.delete('/api/ppt-library/:id', (req, res) => {
    try {
        let library = JSON.parse(fs.readFileSync(PPT_LIBRARY_FILE, 'utf-8'));
        const ppt = library.find(p => p.id === req.params.id);
        
        if (ppt && ppt.fileId) {
            // 删除上传的文件目录
            const pptDir = path.join(UPLOADS_DIR, ppt.fileId);
            if (fs.existsSync(pptDir)) {
                fs.rmSync(pptDir, { recursive: true });
            }
        }
        
        library = library.filter(p => p.id !== req.params.id);
        fs.writeFileSync(PPT_LIBRARY_FILE, JSON.stringify(library, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '删除失败' });
    }
});

// 搜索PPT库
app.get('/api/ppt-library/search', (req, res) => {
    try {
        const { keyword } = req.query;
        const library = JSON.parse(fs.readFileSync(PPT_LIBRARY_FILE, 'utf-8'));
        
        if (!keyword) {
            return res.json({ results: [] });
        }
        
        const lowerKeyword = keyword.toLowerCase();
        const results = [];
        
        library.forEach(ppt => {
            // 搜索PPT标题
            if (ppt.title?.toLowerCase().includes(lowerKeyword)) {
                results.push({
                    type: 'ppt',
                    pptId: ppt.id,
                    pptTitle: ppt.title,
                    matchType: 'title',
                    slides: ppt.slides
                });
            }
            
            // 搜索标签
            if (ppt.tags?.some(tag => tag.toLowerCase().includes(lowerKeyword))) {
                results.push({
                    type: 'ppt',
                    pptId: ppt.id,
                    pptTitle: ppt.title,
                    matchType: 'tag',
                    slides: ppt.slides
                });
            }
            
            // 搜索幻灯片中的案例（如果有标注）
            if (ppt.cases) {
                ppt.cases.forEach(caseItem => {
                    if (caseItem.stockName?.toLowerCase().includes(lowerKeyword) ||
                        caseItem.stockCode?.toLowerCase().includes(lowerKeyword) ||
                        caseItem.content?.toLowerCase().includes(lowerKeyword)) {
                        results.push({
                            type: 'case',
                            pptId: ppt.id,
                            pptTitle: ppt.title,
                            caseId: caseItem.id,
                            stockName: caseItem.stockName,
                            stockCode: caseItem.stockCode,
                            slideNumber: caseItem.slideNumber,
                            slideImage: ppt.slides.find(s => s.slideNumber === caseItem.slideNumber)?.path
                        });
                    }
                });
            }
        });
        
        res.json({ results });
    } catch (err) {
        res.status(500).json({ error: '搜索失败' });
    }
});

// 在PPT中添加案例标注
app.post('/api/ppt-library/:id/cases', (req, res) => {
    try {
        let library = JSON.parse(fs.readFileSync(PPT_LIBRARY_FILE, 'utf-8'));
        const pptIndex = library.findIndex(p => p.id === req.params.id);
        
        if (pptIndex === -1) {
            return res.status(404).json({ error: 'PPT不存在' });
        }
        
        if (!library[pptIndex].cases) {
            library[pptIndex].cases = [];
        }
        
        const newCase = {
            id: Date.now().toString(),
            ...req.body,
            createdAt: new Date().toISOString()
        };
        
        library[pptIndex].cases.push(newCase);
        fs.writeFileSync(PPT_LIBRARY_FILE, JSON.stringify(library, null, 2));
        
        res.json({ success: true, data: newCase });
    } catch (err) {
        res.status(500).json({ error: '保存失败' });
    }
});

// 页面路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 股票案例印证系统运行在端口 ${PORT}`);
});
