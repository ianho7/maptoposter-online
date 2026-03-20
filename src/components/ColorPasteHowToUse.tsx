import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, Check, HelpCircle } from "lucide-react";
import * as m from "@/paraglide/messages";

// interface ColorPasteHowToUseProps {
//   className?: string;
// }

export function ColorPasteHowToUse() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pre-defined Markdown prompt (read-only, for user reference and copy)
  const prompt = `# 🗺️ 地图海报生成 — 主 Prompt 模板 v4（中文版）
> 适用于 **nano banana**（或任何支持参考图风格迁移的模型）
> 工作流程：提供一张参考图 + 本 prompt → 生成风格一致、高质量的地图配色方案

---

## 📌 使用方法

1. 将你的**风格参考图**附加在本 prompt 上方
2. 将 \`[城市名称]\` 替换为目标城市
3. 整体发送给 nano banana

---

## 🎨 从 18 张优秀地图中提炼的配色规律（必读）

在生成配色方案之前，请先理解并遵守以下四条核心规律。

### 规律一：坚持"单色宇宙"策略，但允许 accent 风格例外
大多数优秀地图只使用一个色相家族，通过明度和饱和度梯度区分所有图层。
- 整张地图的主色调（背景、建筑、植被、水体、次级道路）应属于同一色温方向
- **例外：accent 道路风格**——若参考图中存在大面积高饱和强调色（如金色，品红、青绿），主干道和高速路可以使用该 accent 色，与背景形成强对比（Dubai 金色道路、Seattle 青绿道路、Singapore 品红/青双色道路均属此类）
- POI 永远是强调色，不受同色相限制

### 规律二：所有颜色优先从参考图提取，且必须匹配面积权重
**这是整个 prompt 最重要的原则。** 每一个字段的颜色都必须来自参考图，且提取时必须考虑该颜色在画作中的**面积占比**：

- **大面积图层**（background、park_greenery、water）→ 必须从参考图中**占据大面积的主色**中提取，不得用画作中只占小面积的次要色或点缀色来填充
- **小面积元素**（poi、roads.highway、roads.primary）→ 可以使用参考图中的次要色或点缀色
- 背景不默认米白，水体不默认蓝色，植被不默认绿色，POI 不默认橙色或蓝色
- 只有当参考图中确实不含某种颜色时，才按字段规则的备选逻辑处理

**面积权重示例（海浪日落画）：**
- 橙红天空占 ~60% → background 和 park_greenery 应从此色域提取
- 深绿海浪占 ~25% → 可用于 water 或 park_greenery，但不应同时大面积使用
- 近黑深水占 ~10% → 适合 water（深色区域）
- 亮黄高光占 ~5% → 适合 poi（小面积点缀）

### 规律三：深色图与浅色图的明度逻辑完全相反
- **浅色背景地图**：道路比背景深，植被比背景深，水体饱和度比背景高；文字为深色
- **深色背景地图**：道路比背景亮，植被比背景略深或略亮；文字为亮色
- 先判断参考图是深色调还是浅色调，再决定所有元素的明度方向

### 规律五：艺术作品转地图时必须主动降低饱和度
这是最容易被忽视、但对视觉舒适度影响最大的规则。

**核心原因：** 绘画的高饱和色彩之所以不刺眼，是因为有笔触、纹理，明暗过渡在稀释它；地图是大面积纯平填色，同样的颜色铺满整张图后视觉压力会放大 3–5 倍。

**降饱和规则：**
- 所有从艺术作品中提取的颜色，在用于地图之前，必须将 HSL 饱和度**降低 25–40%**
- **大面积图层**（background、park_greenery）饱和度上限：≤ 50% HSL
- **中面积图层**（water、roads）饱和度上限：≤ 60% HSL
- **小面积元素**（poi）可保留较高饱和度（≤ 85%），这是全图唯一允许的高饱和点

**互补色碰撞规则：**
- 若使用"张力策略"（背景与水体为互补色），则**两者中至少有一方饱和度必须低于 35%**，避免高饱和互补色直接碰撞产生"色彩振动"（颤抖感、不安感）
- 互补色张力的美感来自色相对比，而非饱和度对抗；降低其中一方的饱和度不会损失张力，只会让画面稳定

**示例（海浪日落画）：**
- 画作橙红 \`#C84020\`（饱和度约 70%）→ 地图背景应降至 \`#8A3820\`（饱和度约 40%）
- 画作深青绿 \`#0A5040\`（饱和度约 80%）→ 地图水体应降至 \`#1A4035\`（饱和度约 35%）

### 规律六：水体有两种策略，不可混用
- **和谐策略**：水体取背景同色相，加深明度或提高饱和度（整体感强）
- **张力策略**：水体取背景的互补色方向（视觉冲击力强，如暖橙背景 + 冷青水体）
- 两种策略只能选一种，全图统一

---

## 🖼️ 风格提取指令（发给 AI）

\`\`\`
分析上方提供的参考图，提取以下视觉属性作为本次地图配色的风格基准：

- 整体色调方向（参考图的主色是哪个色相？深色系还是浅色系？）
- 参考图中存在哪些强调色或点缀色？
- 线条粗细风格（发丝级 / 中等 / 粗犷）
- 字体气质（几何无衬线 / 人文无衬线 / 衬线 / 手绘）
- 细节密度（极简 / 均衡 / 丰富）

提取完成后，将所有风格属性应用于地图的每一个元素。
不得引入参考图中不存在的颜色。
\`\`\`

---

## 🗺️ 地图生成核心指令

\`\`\`
以上方参考图提取的视觉风格，为 [城市名称] 生成一份高质量的平面城市地图海报配色方案。

地图必须按以下严格的视觉层级顺序渲染各图层（从底到顶）：
背景 → 水体 → 植被 → 建筑街区 → 道路网络 → POI 标记 → 文字标注

输出为海报级质量（等效 300 dpi），正方形或竖版构图，
留白边距风格与参考图保持一致。
\`\`\`

---

## 🎨 元素配色规范（JSON）

> **AI 使用说明：** 分析参考图后，仅输出以下结构的 JSON 对象。
> 所有 hex 值必须从参考图色板中提取，同时遵守每个字段的规则说明。
> 不得增加额外字段，不得在 JSON 以外输出任何文字。

\`\`\`json
{
  "background": {
    "value": "<hex>",
    "角色": "地图的视觉底层。颜色必须忠实还原参考图的主色调。",
    "规则": [
      "【首要规则】直接从参考图提取主导色。参考图是深蓝→背景是深蓝；橙红→背景是橙红；暗紫→背景是暗紫。不得自行替换为米色、沙色、浅黄等中性色",
      "不得默认使用中性色（米白、沙色、浅黄，米灰）——除非参考图本身就是这类色调",
      "不得使用纯白（#FFFFFF）或纯黑（#000000）",
      "提取到画作颜色后，必须将饱和度降低 30–50% 再用于地图背景——画作的高饱和色直接平铺会产生视觉压迫感",
      "背景色的 HSL 饱和度目标范围：15–45%，不得超过 55%",
      "所有其他地图元素必须能在此背景色上清晰辨识"
    ]
  },

  "text": {
    "value": "<hex>",
    "角色": "所有地图文字标注：道路名、区域名、POI 标签、标题栏。",
    "规则": [
      "【首要规则】先判断背景是深色还是浅色，再决定文字明度方向",
      "浅色背景地图：文字应为深色低饱和调性（如深棕、深灰、深蓝），从参考图暗部提取",
      "深色背景地图：文字应为亮色（如白色、浅灰、浅金），从参考图亮部或高光提取",
      "与背景色的对比度必须达到最低 4.5:1（WCAG AA 标准）",
      "不得使用纯黑（#000000）或纯白（#FFFFFF）",
      "携带与参考图色调一致的轻微色相倾向"
    ]
  },

  "mask_gradient": {
    "value": "<hex>",
    "角色": "海报边缘暗角（vignette）渐隐遮罩的实色端点。",
    "规则": [
      "必须与背景色相近或完全一致",
      "通常与背景色完全相同，除非参考图边缘有明显色调变化"
    ]
  },

  "water": {
    "value": "<hex>",
    "角色": "所有水体：海洋、海湾、港口、河流、湖泊、水塘。",
    "规则": [
      "【首要规则】从参考图中提取水体或暗部颜色，不得默认输出蓝色",
      "【和谐策略】若参考图整体色调统一：取背景同色相，提高饱和度或加深明度",
      "【张力策略】若参考图存在冷暖对比：暖色背景配冷色水体，直接从参考图冷色区域提取",
      "两种策略只能选其一，全图统一",
      "【互补色碰撞警告】若使用张力策略，背景与水体中至少有一方 HSL 饱和度必须低于 35%",
      "水体 HSL 饱和度上限：60%"
    ]
  },

  "park_greenery": {
    "value": "<hex>",
    "角色": "所有植被区域：公园、花园、广场、森林，自然保护区。",
    "规则": [
      "【首要规则】park_greenery 是大面积图层，必须从参考图中面积占比最大的色域提取",
      "若参考图绿色是小面积次要色，不得将其用于 park_greenery 大面积填充",
      "植被颜色的功能性要求：与背景色有可辨识的明度或饱和度差异（对比度最低 1.4:1）",
      "浅色背景：植被比背景更深；深色背景：植被比背景略深或饱和度略高",
      "提取到的颜色同样需要降低饱和度 30–50%",
      "饱和度目标：HSL 饱和度 10–35%，不得超过 45%"
    ]
  },

  "poi": {
    "value": "<hex>",
    "角色": "POI 标记填充色。全图唯一的强调色。",
    "规则": [
      "【首要规则】从参考图中提取最鲜明的强调色或点缀色",
      "若参考图中没有明显强调色，则选色相环与背景色相差距 >120° 的颜色",
      "这是全图唯一允许的高饱和度颜色",
      "在背景、水体、植被三种底色上的对比度均须达到最低 3:1"
    ]
  },

  "roads": {
    "highway": {
      "value": "<hex>",
      "角色": "高速公路与快速路，道路层级最高。",
      "规则": [
        "【accent 道路风格】若参考图存在高饱和强调色，高速路使用该 accent 色",
        "【同色系道路风格】若参考图为单色调，高速路取背景同色相"
      ]
    },
    "primary": {
      "value": "<hex>",
      "角色": "主干道，连接各主要区域。",
      "规则": [
        "accent 风格：使用降调版 accent 色",
        "同色系风格：取背景同色相，向背景方向过渡"
      ]
    },
    "secondary": {
      "value": "<hex>",
      "角色": "次干道，区域内部连接道路。",
      "规则": [
        "单描边，线宽：2.5px",
        "颜色进一步向背景方向过渡"
      ]
    },
    "tertiary": {
      "value": "<hex>",
      "角色": "三级道路，局部连接道路。",
      "规则": [
        "单描边，线宽：1.5px",
        "与背景色差异进一步缩小"
      ]
    },
    "residential": {
      "value": "<hex>",
      "角色": "居住区道路与小街道。",
      "规则": [
        "单描边，线宽：1px",
        "与背景色明度差极小，若隐若现但仍可辨识"
      ]
    },
    "other": {
      "value": "<hex>",
      "角色": "服务道路、步行道、小径及未分类街道。",
      "规则": [
        "单描边，线宽：0.8px",
        "步行道可使用虚线样式"
      ]
    }
  }
}
\`\`\`

---

## 🖼️ 构图与版式规则

\`\`\`
海报构图：
- 地图内容占画布面积的 80–85%
- 四边留白均匀，宽度约为画布宽度的 6–8%
- 留白区域与暗角渐隐均使用 mask_gradient 颜色
- 城市中心大致居中，四个象限视觉重量均衡

标题栏（底部）：
- 城市名称使用大字号展示型字体
- 下方一行：经纬度坐标或城市副标题，小字号
- 城市名与副标题之间加细分隔线

比例尺与指北针：
- 位于画布右下角，线条极细
- 颜色使用 text 值，不透明度 40%
\`\`\`

---

## 🚫 全局禁止事项

\`\`\`
视觉处理：
- 不得在任何地图图层使用渐变（仅平铺色块）
- 不得使用阴影、发光或模糊效果
- 不得使用 3D 建筑挤出或等轴测视角
- 不得使用照片纹理背景

颜色使用：
- 不得使用纯黑（#000000）或纯白（#FFFFFF）作为任何字段的值
- 除 poi 及 accent 道路外，不得引入其他高饱和度颜色
- 除非参考图明确为霓虹风格，否则不得使用荧光色
- 不得在参考图无对应色的情况下默认使用：米色背景、蓝色水体、绿色植被、橙色或蓝色 POI

文字处理：
- 全图只使用一种字体家族
- 不得出现小于 6px 的文字
- 所有文字标注必须带有 halo（字体描边/晕渲）
\`\`\`

---

## ✅ 质量自检清单（输出前验证）

\`\`\`
□ 输出为合法 JSON 对象
□ background 色相与参考图主色一致，未被替换为米色/沙色
□ text 明度方向正确，对比度 ≥ 4.5:1
□ water 颜色来自参考图
□ park_greenery 颜色来自参考图的大面积主色域
□ poi 颜色来自参考图强调色
□ 所有对比度要求均已满足
□ 所有颜色值均非纯黑或纯白
□ mask_gradient 与 background 相同或极接近
□ 所有大面积图层的 HSL 饱和度均 ≤ 55%
\`\`\``;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy prompt:", error);
    }
  };

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className={"gap-1.5 text-primary bg-transparent hover:bg-transparent cursor-pointer"}
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{m.how_to_use_btn()}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] sm:w-full max-h-[90vh] overflow-y-auto">
          <div className="space-y-4 sm:space-y-5">
            {/* Header */}
            <DialogTitle className="text-lg font-serif font-semibold">
              {m.how_to_use_title()}
            </DialogTitle>

            {/* Step 1 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                  1
                </span>
                <span className="font-medium text-sm">{m.how_to_use_step1_title()}</span>
              </div>
              <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
                {m.how_to_use_step1_desc()}
              </p>
            </div>

            {/* Prompt Box */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">{m.how_to_use_prompt_label()}</Label>
              <div className="relative">
                <div
                  className="w-full min-h-[120px] sm:min-h-[150px] p-3 text-[10px] leading-relaxed font-mono bg-secondary/50 border border-border rounded-md text-foreground whitespace-pre-wrap break-words overflow-y-auto max-h-[200px]"
                >
                  {prompt}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute right-1.5 top-1.5 h-7 px-2 sm:px-3"
                  onClick={handleCopyPrompt}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span className="ml-1 text-[10px] hidden sm:inline">
                    {copied ? m.how_to_use_copied() : m.how_to_use_copy_prompt()}
                  </span>
                </Button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                  2
                </span>
                <span className="font-medium text-sm">{m.how_to_use_step2_title()}</span>
              </div>
              <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
                {m.how_to_use_step2_desc()}
              </p>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium shrink-0">
                  3
                </span>
                <span className="font-medium text-sm">{m.how_to_use_step3_title()}</span>
              </div>
              <p className="text-xs text-muted-foreground pl-7 leading-relaxed">
                {m.how_to_use_step3_desc()}
              </p>
            </div>

            {/* Close */}
            <div className="flex justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                {m.how_to_use_close()}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
