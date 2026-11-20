# 主界面美术素材

使用 Codex 内置 ImageGen 生成，成品以 WebP 存放在 [frontend/src/assets](../frontend/src/assets/)。

## 风景底图定稿

现用 7 张风景底图统一采用嘉兴南湖日景的 B2 画风。地图保持各自的时段、地貌和地标，以柔光和大块明暗表现远景，在近处保留木石与建筑细节。

- [嘉兴南湖日景](../frontend/src/assets/jiaxing-spring.webp) 是选定的画风参考。
- [嘉兴晨景 · 登录](../frontend/src/assets/login-jiaxing.webp)
- [南湖石台 · 选角](../frontend/src/assets/selection-scene.webp)
- [嘉兴暮色](../frontend/src/assets/jiaxing-dusk.webp)
- [终南后山](../frontend/src/assets/zhongnan.webp)
- [大漠商道](../frontend/src/assets/damo.webp)
- [湘西黑沼](../frontend/src/assets/heizhao.webp)

### 重绘提示词

以下六张由内置 ImageGen 重绘，分别以旧场景和嘉兴南湖日景为构图与画风参考。下文各模块也保留了初稿提示词。

```text
Use case: style-transfer. Asset type: production environment artwork for a Chinese wuxia game. Image 1 is the existing scenery to repaint and the sole reference for its camera, proportions, layout, time of day and main landmarks. Image 2 is the approved B2 Jiaxing background; match only its cleaned painterly realism, subdued natural colors, broad continuous tonal shapes, soft modeled light and selective material detail. Suppress fine visual noise decisively: clear smooth sky, water, mist and distant land; foliage grouped in readable masses; restrained textures on foreground timber and stone. Keep meaningful structure sharp where it matters. Real, softly modeled volumes, not a cel-shaded illustration, poster abstraction, monochrome filter, photoreal microtexture, film or paper grain. No text, logos, UI, framing, border, or watermark.
```

#### 嘉兴晨景 · 登录

```text
Repaint the Jiaxing Yanyu Lou login sunrise. Deliver the same 16:9 wide crop as image 1. Preserve the three-story tiled pavilion at left center, arching stone bridge just to its right, the overhanging dark blossom tree at the upper left, the small back-facing reed-hatted ivory and blue traveler on the lower-left stone approach, and the low covered boat moored beyond the bridge. Keep the composition's right third relatively open for a separate login panel: quiet lake with broad blue-jade reflections and pale blue-gray distant hills. Simplify leaf-speckling on the hills, petals, carved lines in stone, and busy glints on water. Use an understated pale apricot sun glow with softly shaded clouds, small amber windows, and let lit edges on the main pavilion and bridge ground the morning view. Room for a dark clear upper-left logo area and a right panel. No additional people or new landmarks.
```

#### 南湖石台 · 选角

```text
Repaint the wide Jiaxing stone terrace where the game draws the selectable hero separately. Maintain the identical 16:9 frame as image 1. Preserve the large open empty circular stone terrace at bottom center, low stone balustrade across the middle, arching peach trunk on the left, timber halls beside the lake, far ridges and pavilion, and the wooden waterwheel to the right of center. No painted people or animals. Use a moderately shaded left for the separate role list and a quieter central background behind the full body hero. Large matte stone slabs, muted celadon water and softened outlines on the distant ridges and cliffs. Reduce bright whites of waterfalls to an understated small spillway, simplify treetop and flower repetition, retain a few near lanterns and rose blossoms as accents in daylight.
```

#### 嘉兴暮色

```text
Repaint the square Jiaxing canal twilight with the same viewpoint and landmark positions as image 1. White-plaster Jiangnan buildings with dark eaves close at left, a soft overhanging cluster of peach blossom, low arc stone bridge a little right of center, willows and a small hill pavilion beyond. Preserve the subdued blue-violet hour, a thin dusty peach horizon, a few warm amber lanterns in doors and windows, and their soft elongated reflections in the blue-green canal. Render reflection shapes wide and quiet, with only a few moving ripples, no dense bright glitter or pink speckling. Smooth cloud masses, grouped willow foliage, selectively modeled nearby timber door and bridge stone. Keep enough visible midtones for the game's twilight UI. No people or large new objects.
```

#### 终南后山

```text
Repaint the square Zhongnan rear mountain Daoist temple in image 1. Preserve the same climbing gray stone staircase from bottom center to the temple on the right, weathered pine trunk and heavy canopy in the left foreground, weathered pale plaster and gray tiles, and layered peaks with fog behind. Quiet blue-green, pine, warm gray stone, small worn ochre accents in the timber. Distinguish the staircase treads with broad light and shadow, and give focal detail to the temple eaves and nearest pine trunk. Group pine needles into boughs with legible silhouettes, keep the far forests, rocky mountains, drifting valley fog and sky soft and low detail, no all-over high-frequency rock pits or scattered white spots. Small hint of incense smoke at the entrance, no prominent people.
```

#### 大漠商道

```text
Repaint the square Silk Road desert caravan from image 1. Preserve massive layered russet sandstone escarpments at the left, the low winding sand path leading toward broad dunes and remote cliffs to the right, and the small camel train with guide moving along the center-lower trail. Keep the natural dry afternoon breadth, dusty sand-gold and warm ochre rock, lavender-shadowed dunes, muted blue sky with only a few broad wisps. Render dune shapes as calm tonal fields, with smooth windward and shadowed faces, no fields of tiny sand streaks or speckled pebbles. Use large physical stratification and a few good edges in the closest rock, clean silhouettes for the tiny camel train. No tents, extra buildings, glowing effects, or other additions.
```

#### 湘西黑沼

```text
Repaint the square Xiangxi black-marsh twilight from image 1. Preserve the bowed willow leaning from the left over the canal, the readable zigzag wooden boardwalk leading from the low foreground to the stilted two-level lantern-lit lodge on the right, reeds and a few lotus pads nearby, and blue mist over the far bank. Give the deep dusk believable values: muted ink blue, blue-jade water, quiet greens and a few muted amber windows. Keep the planks and rail posts clear enough to read under game dimming and show a few local wet reflections on timber; simplify reeds and willow strands into grouped shapes. Use broad soft water reflections, minimal firefly points, and calm layers of mist; no speckled water, grain, exaggerated horror or neon bloom. No people.
```

## 登录界面

- 嘉兴南湖晨景：[login-jiaxing.webp](../frontend/src/assets/login-jiaxing.webp)，使用内置 ImageGen 生成。构图参考用户登录界面图片，内容改为本项目射雕篇起点：烟雨楼、南湖石桥与无门派旅人。登录框及文字由 Vue / CSS 渲染。

  > Use case: stylized-concept. Asset type: a wide 16:9 full-bleed environment painting for the login screen of the existing Chinese wuxia RPG 金庸群侠·问道武林, opening chapter 射雕英雄传, starting at Jiaxing South Lake. Input image 1 is a reference ONLY for premium painterly rendering, warm sunrise lighting, the inviting journey composition, peach-and-pine framing and architectural detail. Input image 2 is a reference for the EXISTING game's Jiangnan architecture, blue-green lake palette and environmental painting style. Create a NEW landscape that fits grounded Jin Yong martial-arts adventure, rather than a sect sanctuary or fantasy celestial realm. Setting: beautiful Song-inspired Jiangnan lakeside at dawn, an elegant three-storey dark-tiled timber pavilion inspired by Jiaxing's Yanyu Lou dominates the LEFT middle ground, warmly lit windows, a few quiet surrounding waterside houses, carved stone bridge and steps lead from bottom center-left toward the pavilion's entrance, small stone lanterns along the path, a tranquil turquoise lake with one small moored wooden boat, willows, pink peach blossoms, broad distant forested hills and a few layered limestone ridges fading into pale mist. Warm pale-gold sunrise near upper center-left, blue and pale-lavender morning sky, rich dimensional detail and convincing depth, welcoming lived-in wuxia Jiangnan, landscape remains grounded and habitable. One lone gender-neutral adult wandering swordsman seen entirely from behind stands on the LOWER LEFT stone path, wearing a simple ivory and slate-blue traveling cloak and a woven bamboo hat, carrying a sheathed straight jian, looking toward the pavilion; small enough that the landscape remains the hero, entire figure visible, head around 49% image height, feet around 86%. Overhanging pine and pink peach branches naturally frame upper-left, leaving a darker calm area at top-left for a separate logo overlay. RIGHT third is a calm continuous extension of blue-green water, pale mist and distant hills for a separate dark login form overlay; no form drawn in the image. The left pavilion, path and traveler must remain visible when a panel later covers the right 35%. Premium detailed digitally painted Chinese MMORPG concept art, tasteful realistic colors, warm amber lighting against cool jade and blue shadows, finely rendered tactile roofs, stone and silk, subtle brush texture. No dramatic flying waterfalls, no floating islands, no giant sect gateway, no giant palace, no magical aura. Absolutely NO UI, panels, buttons, frames, captions, signs with text, writing, logo, letters, watermark or collage. One coherent edge-to-edge illustration.

## 角色选择界面

根据用户提供的参考图，使用内置 ImageGen 分别生成场景与透明立绘。界面文字、边框、按钮均由 Vue / CSS 渲染。

- 场景：[selection-scene.webp](../frontend/src/assets/selection-scene.webp)

  > Use case: stylized-concept. Asset type: wide 16:9 landscape background painting for a Chinese wuxia RPG character selection scene. Input image 1 is the reference for environment, framing, palette and painterly game-art style only. Recreate the same peaceful sunny Jiangnan peach-blossom village and grand misty mountain setting as a clean environment illustration with ALL UI, logos, borders, panels, buttons, banners, writing and ALL PEOPLE completely absent. Foreground: a broad weathered circular stone terrace with a subtle circular paving design in lower center, mossy stone balustrade leading across lower right, flowering pink peach trees and detailed stones at edges. Midground: turquoise pond, ancient wooden waterwheel around right-center, elegant two-storey tiled wooden pavilion with warm lanterns on far right, small arched stone bridge, lively falling water. Background: spectacular layered green mountains with waterfalls and pagodas, airy blue sky and white clouds. A peach-blossom branch frames upper left. Rich but natural colors, detailed hand-painted premium MMORPG concept art, convincing spatial depth. Center of terrace is EMPTY and has space for a full-body character rendered later. Keep far left quarter relatively shaded for separate UI panel. Exactly one coherent uninterrupted full-bleed scene. No humans, no character, no text, no UI, no border, no banners, no symbols, no watermarks.

- 女侠立绘 [selection-heroine.webp](../frontend/src/assets/selection-heroine.webp) 保留象牙白、梅色与持剑站姿，改以哑光织物呈现交领衣裙。
- 男侠立绘 [selection-hero.webp](../frontend/src/assets/selection-hero.webp) 保留象牙白与靛青，以素布长袍、旧革护腕和直剑呈现行旅装束。
- 两张立绘均为 800 × 1200 透明 WebP。见 [男女主角重绘提示词](./character-portraits.md#男女主角重绘)。

## 装备与道具图标

新增 20 张交付用 4 × 4 图集，共 311 枚图标，另沿用原装备图集的 16 枚。每张为 768 × 768 WebP。武库装备位、背包、换装对比、道具详情和市井相关入口从同一份映射读取。

- [图集目录](../frontend/src/assets/item-icons/) 收纳名器、30 套历练装备、门派装备、丹药、药材、暗器与常见材料。
- [图格与物品 ID](../frontend/src/config/itemIcons.ts) 按从左到右、从上到下排序。摧心、聚势从底件继承，武学残页使用同一张破页图。

以下为内置 ImageGen 绘制每张图集时使用的共用提示词。各格按配置中的物品名称、材质和用途绘制。

```text
Use case: precise-object-edit. Produce one square original game icon texture atlas for the Wuxia RPG "问道武林". Replace all 16 objects of the reference sheet with the objects specified below. The reference only provides layout, matte realistic painting, and lighting. The output MUST have exactly four columns and four rows, each cell an identical square, touching edge to edge with zero gutters or dividers. Every cell has the same solid charcoal near-black backdrop (#151719), no drawn grid or borders. Center exactly one distinct icon group in each cell, fully inside, with 10% inward margin on every side; no item may touch or cross a cell boundary. Painterly-realistic Southern-Song game item silhouettes, matte leather, silk, wood or iron, natural hue, gentle soft light, smooth shading and carefully limited texture like the game's B2 illustrations. Refine details only where they support a recognizable 36-pixel icon. No scenery, text, letterform, number, UI, border, watermark, framing or cell labels. Each numbered row describes the four cells in strict left-to-right order.
```

### 名器独立原画

首批五件名器用项目原有的写实笔触单独重绘。成品为 1024 × 1024 透明 WebP，背包与兵器谱使用缩小图，装备详情和鉴赏弹窗放大同一张图。

其余武器和兵刃的独立原画见 [兵器原画清单](./weapon-illustrations.md)。

- [乌金玄铁重剑](../frontend/src/assets/item-illustrations/xuantie_heavysword.webp)
- [真·绿玉打狗棒](../frontend/src/assets/item-illustrations/dagou_stick_true.webp)
- [东邪·碧玉箫](../frontend/src/assets/item-illustrations/biyu_xiao.webp)
- [西毒·怪蛇灵蛇杖](../frontend/src/assets/item-illustrations/lingshe_zhang.webp)
- [大漠金刀](../frontend/src/assets/item-illustrations/dadiao_jindao.webp)

内置 ImageGen 以 [原名器图集](../frontend/src/assets/item-icons/named-weapons.webp)为材质和光线参考。下列共用提示词分别与各件名器的描述组合使用。

```text
Use case: stylized-concept. Asset type: one individual original, high-resolution game relic illustration for the Chinese wuxia RPG 问道武林, to be used both as a square inventory thumbnail and as an enlarged inspected item. The provided image is ONLY a reference for the project's matte realistic painting, soft restrained light and natural historical materials. Ignore its collage. Render ONLY the item described below, one artwork with no cells or adjacent items. Believe in the weight and material; clearly modeled hand-painted volumes, subtle edges and wear, no pervasive grain or bright noisy texture. Light this from upper left and add a restrained soft edge highlight so even the dark model will read on the game's dark charcoal UI. Use diagonally placed, composed full-object framing in a square 1:1 canvas, as large as safely fits with at least 6% clear margin at the furthest ends. Let the middle of the object cross the central area so its silhouette reads at 32 pixels. True RGBA transparency on every background pixel, no floor, contact shadow, plate, card, frame, texture field, letters, logo, watermarks, character, hand, magic effect, spark, blood or scene. Focus on the static decorative portrayal of a fictional relic.
```

#### 乌金玄铁重剑

```text
Subject: A solitary colossal, ancient blunt Chinese straight sword made of almost charcoal-black iron, called 乌金玄铁重剑, the heirloom of the wandering swordsman. It should feel stark, extremely heavy and old. A broad long thick blade with two clearly flattened, dull edges, a wide rounded wedge tip without any needle point, very faint folded iron variation across the flats and soft strike patina concentrated at the rounded edges. Plain low rectangular dusky iron crossguard with barely visible warm patina, short coarse deep brown cord over aged leather around a simple handle, compact dark pommel. Show one correct centered blade emerging naturally from that simple guard. Generous blade length in proportion to hilt, broad across the first two thirds before rounding. Three-quarter facing view slightly from the broad side with the pommel upper right and blunt tip lower left. A thin cool gray rim reflection across the broad metal helps read it at a glance. No scabbard, gems, bright gold or extra objects.
```

#### 真·绿玉打狗棒

```text
Subject: The one full legendary 丐帮 green staff 真·绿玉打狗棒. A long straight slender cylindrical rod of understated spinach-green nephrite with a bamboo-like rhythm of three to four shallow rounded natural joints, softly mottled jade tone, a pale celadon edge and subtly worn oval ends. Purposely practical, handed down and touched by generations, with smooth undecorated surfaces and one small dark umber woven cord tie near the upper end, its short dull cloth tail visible. Have no holes, no flower carving or snake, no spikes, metal collars or large ornaments. Angular diagonal from lower left to upper right with slight perspective and a convincing jade volume. Keep limb slender and slightly substantial so it has a different recognizable silhouette than a flute. No separate props.
```

#### 东邪·碧玉箫

```text
Subject: One elegant Song-era, end-blown long jade xiao flute of the East Heretic, 东邪·碧玉箫. Form a single straight tube, thin, smoothly polished mineral jade in a soft pale sea-green with fine cloudy ivory veins, functional bevelled open mouth end and a readable orderly series of dark round finger holes extending along its visible face. No transverse recorder mouthpiece, mouth reed, flared trumpet or bamboo joints. The closed feeling of clean aqua jade green and dark openings should distinguish it from a green staff. Tiny aged jade bead and compact teal silk knot with a restrained flowing short tassel at the lower end, resting beside the flute without covering its holes. Whole object on a northeast diagonal, show subtle cool translucency only at the rim, luminous stone rather than plastic or magic. A refined, simple personal musical instrument, no extra props.
```

#### 西毒·怪蛇灵蛇杖

```text
Subject: One mysterious, full-length West Venom staff, 西毒·怪蛇灵蛇杖. Long straight black-brown aged hardwood shaft with worn matt iron ferrule at the foot. At the upper end a hand-sized cast bronze head with a small humanlike grinning expression, visibly an antique sculpture with undetailed stylized carved teeth. Just below that finial and partly around its base coil TWO small living serpents of different muted color, one aged olive-green and the other muted clay-black, intertwined around the shaft with believable scales reduced to a few texture accents. Each has ONE actual small closed-mouth head visible separate from the other, looking gently in opposite directions near the finial. Their tails coil around the actual upper shaft, not hovering. The rest of the staff is plain blackened wood with only a few iron and bronze wraps and a worn dark grip. Compose from lower left foot toward upper right head, normal proportions with no long floating parts. Whole relic within frame, no attack action or props.
```

#### 大漠金刀

```text
Subject: One heirloom curved Central Asian steppe saber of the game 大漠金刀, a precious gift delivered as a golden cavalry commander's keepsake. One modestly curved single-edged bright steel blade, with restrained warm reflections and a narrow burnished antique gold band near the heel. Compact slightly angled dark leather grip, curved old gold pommel, low antique gold guard, dark forest green cabochon set into the pommel. One antique gold covered scabbard alongside it, matching that one blade in curvature and length, very restrained scroll embossing and a matching green stone inset on the upper clasp, no extra dangling props. Arrange both as a coordinated full set with blade cutting diagonally from bottom left to top right and scabbard parallel, separated by clean gap. Keep the blade and the ornate gold scabbard immediately distinct in a small thumbnail. Historically grounded and regal, soft gold shades and ultrafine but low-contrast hand-chased decoration, no floating runes.
```

## 主界面素材

- **新增装备图集**（`gear-atlas.webp`）

  > Use case: stylized-concept. Asset type: a square 4-by-4 inventory icon atlas for a Song Dynasty Chinese wuxia RPG, same finish as finely painted premium MMO equipment icons. Exactly 16 equal square cells in a perfectly regular grid with no gutters, borders, dividers, labels or interface. Each tile has its own solid near-black charcoal background. Keep each entire object centered, separated and inside its tile with generous margin; bold readable silhouettes and individual material colors, hand-painted detail and gentle warm studio highlights. Row 1, left to right: woven bamboo conical traveling hat with cord; dark wooden Daoist hair crown with carved pine pattern; deep ivory fur winter hood with plum-purple cloth; short black iron dagger with a small red tassel. Row 2: pair of beige linen bracers; pair of dark teal cloth bracers embroidered with silver swallows; pair of rugged dark iron scale bracers; simple elegant straight blue-steel Chinese jian sword diagonally framed. Row 3: rolled indigo cloth waist sash; rolled brown oxhide belt with brass buckle; curled burgundy waist belt with polished jade plaques; round traditional iron bagua pendant with eight trigrams, no lettering. Row 4: pair of simple grey cloth martial arts boots; pair of reddish brown soft deerskin boots; pair of blue brocade boots with pale cloud embroidery; two neat tied ivory music manuscripts and a dark wooden flute, as one inventory object. No words, letters, numbers, captions, signature or watermark.

- **嘉兴春景**（`jiaxing-spring.webp`，B2 降噪定稿）

  定稿以 ImageGen 重绘，保留茶楼、石径、木桥和水车的构图，简化天空、远山和水面的细碎纹理，并保留近处木石的明暗。以下为初稿提示词。

  > Use case: stylized-concept. Asset type: square environmental background painting for the main playable scene of a Chinese wuxia RPG. Show spring in Song Dynasty Jiangnan, the outskirts of Jiaxing at the shores of Nanhu, as a grand yet lived-in scene from a premium Chinese MMORPG. Eye-level camera from a flower-lined path: tiled timber teahouses and flowering peach trees to the left, a rustic wooden footbridge crossing turquoise running water to the right, large traditional wooden waterwheel in middle-right, a distant pagoda on towering green mountains with airy waterfalls, blue spring sky and white clouds. A single small dark-haired swordswoman in ivory and muted burgundy hanfu walks away from camera on the sunlit path in the lower middle (head roughly 48% down, feet roughly 64% down). A couple of subtle faraway villagers for scale. Wide view and real spatial depth; mountains, terraces, framed by pink blossoms and trailing branches along upper-left edge, path curving into the village. Foreground in lower quarter continues naturally as water, flowers and stones, darker in shade. Art direction: rich detailed painterly high-end 3D game environment concept art with natural sunny atmospheric perspective; beautiful subtle brush textures, tactile roofs, clearly readable terrain. Blue and green setting, light sandstone and warm terracotta, white and restrained cherry-blossom pink. Fill image edge to edge. The output is ONLY the environment illustration, with absolutely no interface, frame, text, logos, letters, signage text or watermark.

- **地图场景**（`zhongnan.webp`、`damo.webp`、`heizhao.webp`、`jiaxing-dusk.webp`）

  > Use case: stylized-concept. Asset type: four independent square environment illustrations in one exact 2 by 2 texture atlas for a premium Chinese Wuxia MMORPG, high resolution square output. No grid lines, frames, gutters or borders; exactly one self-contained illustration per quadrant, clear cuts on horizontal and vertical center lines. Realistic detailed painterly Chinese game environment art with visible brush texture, natural lighting and atmosphere. TOP LEFT: Zhongnan Mountains, dense ancient dark green pine forest and stone steps ascending to a secluded Song Dynasty Daoist mountain temple in misty late morning. TOP RIGHT: a Silk Road merchant trail among immense sunlit warm orange sandstone cliffs and long dunes, a tiny camel caravan on winding path, far blue sky. BOTTOM LEFT: western Hunan wetlands at blue-green twilight, deep jade-colored water, gnarled willow branches, a slim old boardwalk toward a distant thatched timber pagoda, fireflies in silver mist. BOTTOM RIGHT: the shores of South Lake in Jiaxing, peaceful Song dynasty Jiangnan houses with glowing paper lanterns, flowering peach trees, a stone bridge at evening and warm lanterns reflected in blue water. Illustrate each as a wide-angle shot with depth. No interface, no ornamental border, no typography, no signage text, no logos or watermarks.

- **头像、装备、武学与收益图集**（`wuxia-atlas.webp`）

  > Use case: stylized-concept. Asset type: a 4 by 4 texture atlas of Wuxia MMO portrait and inventory sprites, square 1:1 canvas, 16 equal square tiles exactly in a tightly aligned 4-by-4 orthogonal grid; every tile has an independent solid charcoal near-black background, no visible grid lines, no borders, no gutters, no icons crossing tile edges. Keep subjects centered with breathing room. Premium digitally painted detailed game art, recognizable objects at small sizes. Top row left to right: (1) young Chinese swordswoman heroine with dark hair and ivory and wine robes, hairpin and tiny plum blossoms, (2) rugged young male martial artist in coarse indigo robe, (3) clever young female martial artist in pale yellow embroidered robes, (4) mature Chinese male taoist in pale blue robe, each chest-up with face filling its own tile, unique faces. Second row left to right: (1) ornate silver and brass straight Chinese jian sword diagonally upward, (2) silver embroidered martial artist torso tunic as inventory item, (3) ancient bamboo scroll with red cord, (4) jade-green gourd pendant. Third row left to right: four distinct circular skill effects within their tiles, high contrast and clean silhouettes: (1) cyan-white spiraling qi around a bright core, (2) vermilion golden palm-strike flame, (3) turquoise flowing steps and cloud trail, (4) magenta plum blossom energy with a silver blade streak. Bottom row left to right: (1) round cream-gold ancient coin with square hole, (2) polished gold sycee ingot, (3) porcelain coral-red medicine vial, (4) sturdy small glowing golden treasure chest. NO text, letters, numbers, labels, tile decoration, UI or watermark.
