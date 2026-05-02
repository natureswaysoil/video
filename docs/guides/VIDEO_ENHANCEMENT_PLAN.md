# Video Enhancement Plan – Fix Bland HeyGen Videos

**Problem**  
Current videos are pure talking-head avatar → feel corporate and bland.  
**Goal**  
Turn them into authentic, scroll-stopping Nature’s Way Soil videos with:
- Dynamic Pexels B-roll (nature, soil, lawn, family farm shots)
- Real farm footage (you, the soil, before/afters)
- Structured multi-scene scripts

You already added the Pexels API key to Google Secret Manager — perfect.

### New Video Flow (after this update)
1. OpenAI generates **structured JSON** with B-roll keywords for every scene  
2. PexelsService automatically downloads short portrait video clips  
3. HeyGen creates a multi-scene video (avatar + B-roll + your farm clips)  
4. Result = beautiful, living-soil story videos

### Step-by-Step Implementation (GitHub web)

**1. Create new PexelsService.ts** (do this next)
Filename: `src/services/PexelsService.ts`

**2. Update script generation** (in `src/openai.ts` or `src/content-seed-bank.ts`)
Change the prompt so it returns scenes with `brollKeyword`.

**3. Update HeyGen adapter** (`src/heygen-adapter.ts` or `src/heygen.ts`)
Add B-roll scenes using the Pexels URLs.

**4. Add real farm footage**
Record 8–10 short clips on your phone and upload to HeyGen “My Media”.

### Expected Result
Videos will go from “AI avatar reading script” → “gorgeous family farm story with movement, soil close-ups, and real footage.” Engagement will jump dramatically.

Status: ✅ Pexels key ready | ⬜ Code changes needed
