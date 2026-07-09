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

// 提取PPT中的图片（按幻灯片分组）
function extractPptImages(pptxPath, outputDir) {
    const slides = [];
    try {
        const zip = new AdmZip(pptxPath);
        const zipEntries = zip.getEntries();
        
        // PPT中的图片命名通常包含幻灯片编号信息
        // 例如：image1.png, image2.png 对应不同幻灯片
        // 或者我们需要按顺序分配
        
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
        
        // 按顺序分配图片到幻灯片（每张幻灯片可能有多个图片）
        // 简化处理：每张图片作为一个"页面"
        allImages.forEach((img, index) => {
            const ext = path.extname(img.entryName);
            const imageName = `slide-${index + 1}${ext}`;
            const imagePath = path.join(outputDir, imageName);
            
            fs.writeFileSync(imagePath, img.data);
            
            slides.push({
                slideNumber: index + 1,
                imageName: imageName,
                path: `/uploads/${path.basename(outputDir)}/${imageName}`,
                originalName: img.entryName
            });
        });
    } catch (err) {
        console.error('提取图片失败:', err);
    }
    return slides;
}

// 上传PPT到PPT库
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

        // 提取图片（按幻灯片）
        const slides = extractPptImages(pptxPath, imagesDir);

        res.json({
            success: true,
            fileId: fileId,
            originalName: req.file.originalname,
            slides: slides,
            slideCount: slides.length
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
