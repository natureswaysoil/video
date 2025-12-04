# HeyGen Avatar Mapping Implementation Summary

## Overview

This repository **DOES contain** a comprehensive HeyGen avatar mapping implementation. The system automatically selects avatars and voices based on product keywords to create varied, contextually appropriate marketing videos.

## Location of Implementation

### Primary Files

1. **`src/heygen-adapter.ts`** - Avatar/Voice Mapping Logic
   - Contains the mapping rules and payload generation
   - Line 31-37: `CATEGORY_MAP` array with keyword-based rules
   - Line 39-84: `mapProductToHeyGenPayload()` function
   - Line 106-156: `writeBackMappingsToSheet()` function for tracking

2. **`src/heygen.ts`** - HeyGen API Client
   - Handles API communication with HeyGen service
   - Line 61-86: `HeyGenClient` class constructor
   - Line 93-187: `createVideoJob()` method
   - Line 194-248: `getJobStatus()` method  
   - Line 256-351: `pollJobForVideoUrl()` polling mechanism

3. **`src/cli.ts`** - Integration and Usage
   - Line 7-8: Imports HeyGen client and adapter
   - Line 130-212: Main video generation flow with avatar mapping

## Avatar Mapping Rules

The system uses a category-based mapping approach defined in `src/heygen-adapter.ts`:

### Default Configuration
```typescript
const DEFAULTS = {
  avatar: 'garden_expert_01',
  voice: 'en_us_warm_female_01',
  music: { style: 'acoustic_nature', volume: 0.18 },
  lengthSeconds: 30,
}
```

### Category-Specific Mappings

| Product Type | Keywords | Avatar | Voice | Duration | Reason |
|-------------|----------|--------|-------|----------|--------|
| **Kelp/Seaweed** | kelp, seaweed, algae | `garden_expert_01` | `en_us_warm_female_01` | 30s | "matched keyword: kelp" |
| **Bone Meal** | bone meal, bonemeal, bone | `farm_expert_02` | `en_us_deep_male_01` | 35s | "matched keyword: bone meal" |
| **Hay/Pasture** | hay, pasture, forage | `pasture_specialist_01` | `en_us_neutral_mx_01` | 40s | "matched keyword: hay/pasture" |
| **Humic/Fulvic** | humic, fulvic, humate, fulvate | `eco_gardener_01` | `en_us_warm_female_02` | 30s | "matched keyword: humic/fulvic" |
| **Compost/Soil** | compost, tea, soil conditioner | `eco_gardener_01` | `en_us_warm_female_02` | 30s | "matched keyword: compost/soil" |
| **Default** | (fallback for any other product) | `garden_expert_01` | `en_us_warm_female_01` | 30s | "default" |

### How It Works

1. **Text Extraction**: Searches multiple product fields for keywords
   - Title/title
   - Name/name
   - Description/description
   - Details/details
   - Short Description/short_description

2. **Pattern Matching**: Uses regex patterns to detect product categories
   ```typescript
   { pattern: /\b(kelp|seaweed|algae)\b/i, avatar: 'garden_expert_01', ... }
   ```

3. **First Match Wins**: Iterates through rules and uses the first matching pattern

4. **Environment Overrides**: Can override defaults via environment variables
   - `HEYGEN_DEFAULT_AVATAR`
   - `HEYGEN_DEFAULT_VOICE`

## Complete Workflow

### 1. Product Processing (`cli.ts`)
```typescript
// Import mapping function
import { mapProductToHeyGenPayload } from './heygen-adapter'

// Map product to avatar/voice
const mapping = mapProductToHeyGenPayload(record)

// Results include:
// - avatar: selected avatar ID
// - voice: selected voice ID  
// - lengthSeconds: video duration
// - reason: why this mapping was chosen
```

### 2. Video Generation
```typescript
const payload = {
  script: "Generated marketing script",
  avatar: mapping.avatar,      // e.g., "garden_expert_01"
  voice: mapping.voice,         // e.g., "en_us_warm_female_01"
  lengthSeconds: mapping.lengthSeconds,
  music: { style: 'acoustic_nature', volume: 0.18 },
  subtitles: { enabled: true, style: 'short_lines' }
}

const heygenClient = await createHeyGenClient()
const jobId = await heygenClient.createVideoJob(payload)
```

### 3. Google Sheets Tracking (Optional)

When Google credentials are configured, the system writes mapping information back to the sheet:

**Columns Created:**
- `HEYGEN_AVATAR`: Avatar used (e.g., "garden_expert_01")
- `HEYGEN_VOICE`: Voice used (e.g., "en_us_warm_female_01")
- `HEYGEN_LENGTH_SECONDS`: Video duration (e.g., "30")
- `HEYGEN_MAPPING_REASON`: Explanation (e.g., "matched keyword: kelp")
- `HEYGEN_MAPPED_AT`: Timestamp (ISO 8601 format)

```typescript
await writeBackMappingsToSheet(spreadsheetId, sheetGid, [{
  HEYGEN_AVATAR: mapping.avatar,
  HEYGEN_VOICE: mapping.voice,
  HEYGEN_LENGTH_SECONDS: String(mapping.lengthSeconds),
  HEYGEN_MAPPING_REASON: mapping.reason,
  HEYGEN_MAPPED_AT: new Date().toISOString()
}])
```

## Configuration Options

### Environment Variables

**Required:**
- `HEYGEN_API_KEY` - HeyGen API key (direct)
- OR `GCP_SECRET_HEYGEN_API_KEY` - Secret Manager resource name

**Optional:**
- `HEYGEN_API_ENDPOINT` - API endpoint (default: `https://api.heygen.com`)
- `HEYGEN_DEFAULT_AVATAR` - Override default avatar
- `HEYGEN_DEFAULT_VOICE` - Override default voice
- `HEYGEN_VIDEO_DURATION_SECONDS` - Default video length
- `HEYGEN_WEBHOOK_URL` - Webhook for completion notifications

**Sheet Writeback (Optional):**
- `GCP_SA_JSON` - Service account JSON (raw)
- OR `GCP_SECRET_SA_JSON` - Secret Manager resource name
- OR `GS_SERVICE_ACCOUNT_EMAIL` + `GS_SERVICE_ACCOUNT_KEY`

## Testing

### Test Script Available
Located at: `scripts/test-heygen-integration.ts`

**Capabilities:**
- Tests credential loading (direct API key or GCP Secret Manager)
- Creates sample product (kelp-based for testing mapping)
- Maps product to avatar/voice
- Creates video job with HeyGen
- Polls for completion
- Verifies video URL retrieval

**Run Test:**
```bash
npm run test:heygen
```

**Test Output Shows:**
```
🗺️  Mapping product to HeyGen payload...
Mapping result:
  Avatar: garden_expert_01
  Voice: en_us_warm_female_01
  Length: 30 seconds
  Reason: matched keyword: kelp
```

## Key Features

### ✅ Implemented Features

1. **Keyword-Based Mapping**: Automatically selects avatars based on product content
2. **Multiple Avatar Types**: 5 distinct avatar/voice combinations for variety
3. **Configurable Defaults**: Override defaults via environment variables
4. **Duration Control**: Different video lengths based on product category
5. **Tracking**: Writes mapping decisions back to Google Sheets
6. **Testing**: Dedicated test script to verify mapping logic
7. **Error Handling**: Graceful fallbacks and detailed error messages
8. **Documentation**: Comprehensive guide in `HEYGEN_SETUP.md`

### 🎯 Mapping Strengths

1. **Contextual Selection**: Products get avatars that match their category
2. **Diversity**: Multiple avatars prevent repetitive content
3. **Transparency**: Reason field explains why each avatar was chosen
4. **Extensibility**: Easy to add new rules to `CATEGORY_MAP`
5. **Audit Trail**: Sheet writeback creates a record of all decisions

## Code Quality

- ✅ **TypeScript**: Fully typed implementation
- ✅ **Error Handling**: Comprehensive try-catch blocks with logging
- ✅ **Documentation**: Inline comments and external guides
- ✅ **Testability**: Dedicated test script and test support
- ✅ **Configuration**: Flexible via environment variables
- ✅ **Logging**: Detailed logs for debugging and monitoring

## Example Usage Scenario

**Input:** Product with title "Organic Norwegian Kelp Meal Fertilizer"

**Processing:**
1. Text extraction: "Organic Norwegian Kelp Meal Fertilizer"
2. Pattern matching: Matches `/\b(kelp|seaweed|algae)\b/i`
3. Mapping selected:
   - Avatar: `garden_expert_01`
   - Voice: `en_us_warm_female_01`
   - Duration: 30 seconds
   - Reason: "matched keyword: kelp"

**Result:**
- Video created with garden expert avatar
- Warm female voice narration
- 30-second duration
- Mapping info written to sheet for tracking

## Conclusion

**YES**, this repository contains a complete and well-implemented HeyGen avatar mapping system. The implementation includes:

- ✅ Smart category-based avatar selection
- ✅ Multiple avatar and voice options
- ✅ Configurable defaults and overrides
- ✅ Tracking and audit capabilities
- ✅ Comprehensive testing
- ✅ Full documentation
- ✅ Production-ready error handling
- ✅ Integration with main video generation workflow

The system is actively used in the video generation pipeline as evidenced by its integration in `cli.ts` and the comprehensive documentation in `HEYGEN_SETUP.md`.
