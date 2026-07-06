/**
 * 文档解析器 - 提取股票信息
 */

class DocumentParser {
    /**
     * 从文本中提取股票信息
     */
    extractStockInfo(text, sourceDoc = '') {
        const stocks = [];
        
        // 股票代码模式（6位数字）
        const stockPattern = /(\d{6})/g;
        const stockMatches = [...text.matchAll(stockPattern)];
        
        for (const match of stockMatches) {
            const code = match[1];
            // 过滤无效代码（不以0/3/6开头）
            if (!/^[036]/.test(code)) continue;
            
            const stockInfo = {
                stock_code: code,
                stock_name: this.extractStockName(text, code),
                pressure_points: this.extractPressurePoints(text, code),
                support_points: this.extractSupportPoints(text, code),
                risk_points: this.extractRiskPoints(text, code),
                opportunity_points: this.extractOpportunityPoints(text, code),
                evidence_type: this.detectEvidenceType(text, code),
                tags: this.extractTags(text, code),
                source_doc: sourceDoc,
                context: this.getContextAroundCode(text, code, 200)
            };
            
            // 去重
            if (!stocks.find(s => s.stock_code === code)) {
                stocks.push(stockInfo);
            }
        }
        
        return {
            stocks,
            full_text: text,
            summary: stocks.length > 0 
                ? `检测到 ${stocks.length} 只股票：${stocks.map(s => s.stock_code).join(', ')}`
                : '未检测到股票信息'
        };
    }
    
    extractStockName(text, code) {
        const patterns = [
            new RegExp(`(${code}[,，\\s]+([^\\s,，]{2,8}))`),
            new RegExp(`([^\\s,，]{2,8})[,，\\s]+${code}`),
            new RegExp(`${code}\\s*([^(\\s]{2,8})`),
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const name = match[2] || match[1];
                if (name && name !== code && !name.match(/^\d+$/)) {
                    return name.replace(/[,，\s]/g, '');
                }
            }
        }
        return '';
    }
    
    extractPressurePoints(text, code) {
        const pressures = [];
        const context = this.getContextAroundCode(text, code, 500);
        const patterns = [
            /压力[位点][:：]?\s*(\d+(?:\.\d+)?)/g,
            /压力[:：]?\s*(\d+(?:\.\d+)?)/g,
            /上方压力[:：]?\s*(\d+(?:\.\d+)?)/g,
            /阻力[位]?[:：]?\s*(\d+(?:\.\d+)?)/g,
            /目标[价]?[:：]?\s*(\d+(?:\.\d+)?)/g,
            /(\d+(?:\.\d+)?)\s*[元]?.*压力/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && price < 10000 && !pressures.includes(price)) {
                    pressures.push(price);
                }
            }
        }
        return pressures.slice(0, 5);
    }
    
    extractSupportPoints(text, code) {
        const supports = [];
        const context = this.getContextAroundCode(text, code, 500);
        const patterns = [
            /支撑[位点][:：]?\s*(\d+(?:\.\d+)?)/g,
            /支撑[:：]?\s*(\d+(?:\.\d+)?)/g,
            /下方支撑[:：]?\s*(\d+(?:\.\d+)?)/g,
            /止损[位点]?[:：]?\s*(\d+(?:\.\d+)?)/g,
            /(\d+(?:\.\d+)?)\s*[元]?.*支撑/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const price = parseFloat(match[1]);
                if (price > 0 && price < 10000 && !supports.includes(price)) {
                    supports.push(price);
                }
            }
        }
        return supports.slice(0, 5);
    }
    
    extractRiskPoints(text, code) {
        const risks = [];
        const context = this.getContextAroundCode(text, code, 800);
        const patterns = [
            /风险[:：]([^。\n]{3,50})/g,
            /注意[:：]([^。\n]{3,50}风险[^。\n]{0,30})/g,
            /警惕[:：]([^。\n]{3,50})/g,
            /小心[:：]([^。\n]{3,50})/g,
            /跌破[:：]([^。\n]{3,30})/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const risk = match[1].trim();
                if (risk && risk.length > 3 && !risks.includes(risk)) {
                    risks.push(risk);
                }
            }
        }
        return risks.slice(0, 3);
    }
    
    extractOpportunityPoints(text, code) {
        const opportunities = [];
        const context = this.getContextAroundCode(text, code, 800);
        const patterns = [
            /机会[:：]([^。\n]{3,50})/g,
            /买点[:：]([^。\n]{3,50})/g,
            /关注[:：]([^。\n]{3,50})/g,
            /可以介入[:：]([^。\n]{3,50})/g,
            /看好[:：]([^。\n]{3,50})/g,
            /突破[:：]([^。\n]{3,30})/g,
        ];
        
        for (const pattern of patterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const opp = match[1].trim();
                if (opp && opp.length > 3 && !opportunities.includes(opp)) {
                    opportunities.push(opp);
                }
            }
        }
        return opportunities.slice(0, 3);
    }
    
    detectEvidenceType(text, code) {
        const context = this.getContextAroundCode(text, code, 300);
        const typePatterns = {
            '筹码': /筹码|集中度|分布|峰|谷/,
            '机构DC': /机构|DC|主力|资金|大单/,
            '密码': /密码|涨停|量学|口诀/,
            '趋势': /趋势|通道|上升|下降|多头|空头/,
            '量能': /量能|成交量|放量|缩量|量价/,
            'K线': /K线|形态|阳线|阴线|十字星/,
            '支撑压力': /支撑|压力|阻力|突破|跌破/,
            '均线': /均线|MA|5日|10日|20日|金叉|死叉/
        };
        
        for (const [type, pattern] of Object.entries(typePatterns)) {
            if (pattern.test(context)) return type;
        }
        return '';
    }
    
    extractTags(text, code) {
        const tags = [];
        const context = this.getContextAroundCode(text, code, 500);
        const tagPatterns = [
            /#([^\s#]{2,20})/g,
            /【([^】]{2,20})】/g,
            /标签[:：]([^\n]{2,50})/g,
        ];
        
        for (const pattern of tagPatterns) {
            const matches = [...context.matchAll(pattern)];
            for (const match of matches) {
                const tag = match[1].trim();
                if (tag && !tags.includes(tag)) tags.push(tag);
            }
        }
        return tags;
    }
    
    getContextAroundCode(text, code, range) {
        const index = text.indexOf(code);
        if (index === -1) return text;
        const start = Math.max(0, index - range);
        const end = Math.min(text.length, index + range);
        return text.substring(start, end);
    }
}

module.exports = DocumentParser;
