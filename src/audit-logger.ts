/**
 * Audit Trail Logger
 * 
 * Comprehensive logging system to track all decisions and actions
 * in the video posting pipeline. Helps diagnose why posts aren't happening.
 */

export interface AuditEvent {
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'SKIP'
  category: 'ENV' | 'CSV' | 'VIDEO' | 'PLATFORM' | 'AUTH' | 'POSTING' | 'SYSTEM'
  message: string
  details?: Record<string, any>
  rowNumber?: number
  product?: string
}

class AuditLogger {
  private events: AuditEvent[] = []
  private startTime: Date

  constructor() {
    this.startTime = new Date()
  }

  log(event: Omit<AuditEvent, 'timestamp'>): void {
    const fullEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }
    this.events.push(fullEvent)
    
    // Also log to console with formatting
    this.logToConsole(fullEvent)
  }

  private logToConsole(event: AuditEvent): void {
    const prefix = this.getPrefix(event.level)
    const categoryTag = `[${event.category}]`
    const rowTag = event.rowNumber ? `[Row ${event.rowNumber}]` : ''
    const productTag = event.product ? `[${event.product}]` : ''
    
    console.log(`${prefix} ${categoryTag}${rowTag}${productTag} ${event.message}`)
    if (event.details && Object.keys(event.details).length > 0) {
      console.log('  Details:', JSON.stringify(event.details, null, 2))
    }
  }

  private getPrefix(level: AuditEvent['level']): string {
    switch (level) {
      case 'SUCCESS': return '✅'
      case 'ERROR': return '❌'
      case 'WARN': return '⚠️ '
      case 'SKIP': return '⏭️ '
      default: return 'ℹ️ '
    }
  }

  getEvents(): AuditEvent[] {
    return [...this.events]
  }

  getSummary(): AuditSummary {
    const byLevel = this.groupBy(this.events, 'level')
    const byCategory = this.groupBy(this.events, 'category')
    const errors = this.events.filter(e => e.level === 'ERROR')
    const skips = this.events.filter(e => e.level === 'SKIP')
    const successes = this.events.filter(e => e.level === 'SUCCESS')
    
    return {
      totalEvents: this.events.length,
      runDuration: Date.now() - this.startTime.getTime(),
      byLevel: {
        INFO: byLevel.INFO?.length || 0,
        WARN: byLevel.WARN?.length || 0,
        ERROR: byLevel.ERROR?.length || 0,
        SUCCESS: byLevel.SUCCESS?.length || 0,
        SKIP: byLevel.SKIP?.length || 0
      },
      byCategory: {
        ENV: byCategory.ENV?.length || 0,
        CSV: byCategory.CSV?.length || 0,
        VIDEO: byCategory.VIDEO?.length || 0,
        PLATFORM: byCategory.PLATFORM?.length || 0,
        AUTH: byCategory.AUTH?.length || 0,
        POSTING: byCategory.POSTING?.length || 0,
        SYSTEM: byCategory.SYSTEM?.length || 0
      },
      errors: errors.map(e => ({ message: e.message, details: e.details })),
      skips: skips.map(e => ({ message: e.message, details: e.details, rowNumber: e.rowNumber })),
      successes: successes.map(e => ({ message: e.message, rowNumber: e.rowNumber, category: e.category }))
    }
  }

  printSummary(): void {
    const summary = this.getSummary()
    const duration = (summary.runDuration / 1000).toFixed(2)
    
    console.log('\n' + '='.repeat(80))
    console.log('📋 AUDIT TRAIL SUMMARY')
    console.log('='.repeat(80))
    console.log(`⏱️  Run Duration: ${duration}s`)
    console.log(`📊 Total Events: ${summary.totalEvents}`)
    console.log('\n📈 By Level:')
    console.log(`  ✅ SUCCESS: ${summary.byLevel.SUCCESS}`)
    console.log(`  ℹ️  INFO: ${summary.byLevel.INFO}`)
    console.log(`  ⚠️  WARN: ${summary.byLevel.WARN}`)
    console.log(`  ❌ ERROR: ${summary.byLevel.ERROR}`)
    console.log(`  ⏭️  SKIP: ${summary.byLevel.SKIP}`)
    
    console.log('\n📂 By Category:')
    Object.entries(summary.byCategory).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`)
    })
    
    if (summary.errors.length > 0) {
      console.log('\n❌ ERRORS ENCOUNTERED:')
      summary.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.message}`)
        if (err.details) {
          console.log(`     ${JSON.stringify(err.details)}`)
        }
      })
    }
    
    if (summary.skips.length > 0) {
      console.log('\n⏭️  ITEMS SKIPPED:')
      summary.skips.forEach((skip, idx) => {
        const rowInfo = skip.rowNumber ? ` (Row ${skip.rowNumber})` : ''
        console.log(`  ${idx + 1}. ${skip.message}${rowInfo}`)
      })
    }
    
    if (summary.successes.length > 0) {
      console.log('\n✅ SUCCESSFUL OPERATIONS:')
      const postingSuccesses = summary.successes.filter(s => s.category === 'POSTING')
      const videoSuccesses = summary.successes.filter(s => s.category === 'VIDEO')
      
      if (postingSuccesses.length > 0) {
        console.log(`  📱 Social Media Posts: ${postingSuccesses.length}`)
      }
      if (videoSuccesses.length > 0) {
        console.log(`  🎬 Videos Generated: ${videoSuccesses.length}`)
      }
    }
    
    console.log('='.repeat(80) + '\n')
  }

  private groupBy<T extends Record<string, any>>(
    items: T[],
    key: keyof T
  ): Record<string, T[]> {
    return items.reduce((acc, item) => {
      const group = String(item[key])
      if (!acc[group]) acc[group] = []
      acc[group].push(item)
      return acc
    }, {} as Record<string, T[]>)
  }

  clear(): void {
    this.events = []
    this.startTime = new Date()
  }
}

export interface AuditSummary {
  totalEvents: number
  runDuration: number
  byLevel: Record<AuditEvent['level'], number>
  byCategory: Record<AuditEvent['category'], number>
  errors: Array<{ message: string; details?: any }>
  skips: Array<{ message: string; details?: any; rowNumber?: number }>
  successes: Array<{ message: string; rowNumber?: number; category: string }>
}

// Global singleton instance
export const auditLogger = new AuditLogger()
