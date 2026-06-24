"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
function analyzeBOM() {
    return __awaiter(this, void 0, void 0, function* () {
        const filePath = path_1.default.resolve(__dirname, '../../ASTERA/بيانات استيرا(Autosaved).xlsx');
        console.log(`Reading Excel file: ${filePath}`);
        const workbook = new exceljs_1.default.Workbook();
        yield workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet('Sheet1');
        const nameCol = 2;
        const typeCol = 4;
        const priceCol = 5;
        const bomCol = 7;
        const rawMaterials = new Map();
        const products = [];
        worksheet.eachRow((row, rowNumber) => {
            var _a, _b, _c, _d;
            if (rowNumber === 1)
                return;
            // Use .text instead of .value?.toString() to handle RichText properly
            const name = (_a = row.getCell(nameCol).text) === null || _a === void 0 ? void 0 : _a.trim();
            const type = (_b = row.getCell(typeCol).text) === null || _b === void 0 ? void 0 : _b.trim();
            const priceStr = (_c = row.getCell(priceCol).text) === null || _c === void 0 ? void 0 : _c.trim();
            let price = parseFloat(priceStr || '0');
            if (name) {
                if (type !== 'ناتج تصنيع' && type !== 'منتج نهائي') {
                    rawMaterials.set(name, price);
                }
                else {
                    const bomStr = (_d = row.getCell(bomCol).text) === null || _d === void 0 ? void 0 : _d.trim();
                    products.push({ name, price, bomStr });
                }
            }
        });
        console.log(`Loaded ${rawMaterials.size} raw materials.`);
        const analysis = [];
        for (const prod of products) {
            if (!prod.bomStr)
                continue;
            const parts = prod.bomStr.split('/').map((p) => p.trim()).filter((p) => p.length > 0);
            let totalCost = 0;
            const missingMaterials = [];
            const costDetails = [];
            for (const part of parts) {
                const match = part.match(/(.*?)\s*([\d\.]+)[م]?$/);
                let matName = part;
                let qty = 1;
                if (match) {
                    matName = match[1].trim();
                    qty = parseFloat(match[2]);
                }
                let matPrice = rawMaterials.get(matName);
                if (matPrice === undefined) {
                    for (const [rmName, rmPrice] of rawMaterials.entries()) {
                        if (rmName.includes(matName) || matName.includes(rmName)) {
                            matPrice = rmPrice;
                            matName = rmName;
                            break;
                        }
                    }
                }
                if (matPrice !== undefined) {
                    const cost = matPrice * qty;
                    totalCost += cost;
                    costDetails.push(`${matName} (${qty} x ${matPrice} = ${cost.toFixed(2)})`);
                }
                else {
                    missingMaterials.push(matName);
                }
            }
            const margin = prod.price - totalCost;
            const marginPercent = prod.price > 0 ? (margin / prod.price) * 100 : 0;
            analysis.push({
                product: prod.name,
                sellingPrice: prod.price,
                calculatedCost: totalCost,
                margin: margin,
                marginPercent: marginPercent,
                missingMaterials: missingMaterials,
                details: costDetails
            });
        }
        const outPath = path_1.default.resolve(__dirname, '../../../ASTERA_Analysis_Report.md');
        let md = `# تقرير تحليل أسعار التصنيع مقابل أسعار البيع (ASTERA)\n\n`;
        md += `## نظرة عامة\n`;
        md += `- عدد الخامات المسعرة: ${rawMaterials.size}\n`;
        md += `- عدد المنتجات المصنعة التي تم تحليلها: ${analysis.length}\n\n`;
        const negativeMargin = analysis.filter(a => a.margin < 0 && a.calculatedCost > 0);
        if (negativeMargin.length > 0) {
            md += `## ⚠️ منتجات تباع بخسارة (سعر البيع أقل من تكلفة الخامات المجمعة)\n`;
            negativeMargin.forEach(a => {
                md += `- **${a.product}**: البيع (${a.sellingPrice})، التكلفة (${a.calculatedCost.toFixed(2)})، الخسارة (${a.margin.toFixed(2)})\n`;
            });
            md += `\n`;
        }
        const missingStats = analysis.filter(a => a.missingMaterials.length > 0);
        if (missingStats.length > 0) {
            md += `## ℹ️ منتجات تحتوي على خامات غير مسعرة في النظام\n`;
            md += `بعض المنتجات لم يتم حساب تكلفتها بدقة بسبب عدم وجود سعر لبعض الخامات:\n`;
            missingStats.slice(0, 10).forEach(a => {
                md += `- **${a.product}**: خامات مفقودة (${a.missingMaterials.join('، ')})\n`;
            });
            md += `*(تم عرض 10 فقط من أصل ${missingStats.length})*\n\n`;
        }
        md += `## تفاصيل المنتجات والمواد الخام\n\n`;
        analysis.slice(0, 50).forEach(a => {
            md += `### ${a.product}\n`;
            md += `- **سعر البيع:** ${a.sellingPrice}\n`;
            md += `- **تكلفة الخامات المُجمعة:** ${a.calculatedCost.toFixed(2)}\n`;
            md += `- **الربح المتوقع:** ${a.margin.toFixed(2)} (${a.marginPercent.toFixed(1)}%)\n`;
            if (a.details.length > 0) {
                md += `- **مكونات التصنيع:**\n`;
                a.details.forEach((d) => md += `  - ${d}\n`);
            }
            if (a.missingMaterials.length > 0) {
                md += `- **مواد مفقودة التسعير:** ${a.missingMaterials.join(', ')}\n`;
            }
            md += `\n`;
        });
        if (analysis.length > 50) {
            md += `\n*(تم عرض أول 50 منتج فقط للإيجاز)*\n`;
        }
        fs_1.default.writeFileSync(outPath, md, 'utf8');
        console.log(`Analysis report generated at: ${outPath}`);
    });
}
analyzeBOM().catch(e => console.error(e));
