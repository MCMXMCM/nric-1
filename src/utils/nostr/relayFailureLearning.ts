/**
 * Relay Failure Learning System
 * 
 * This system learns from relay failures and stores the actual requirements
 * that relays have, so we can retry with the correct parameters.
 */

export interface RelayFailure {
  relayUrl: string;
  errorMessage: string;
  timestamp: number;
  eventKind: number;
  powBits?: number;
  authRequired?: boolean;
  paymentRequired?: boolean;
  restrictedWrites?: boolean;
}

export interface LearnedRelayRequirements {
  relayUrl: string;
  minPowBits: number;
  requiresAuth: boolean;
  requiresPayment: boolean;
  restrictedWrites: boolean;
  lastUpdated: number;
  failureCount: number;
  successCount: number;
}

class RelayFailureLearning {
  private failures: RelayFailure[] = [];
  private learnedRequirements: Map<string, LearnedRelayRequirements> = new Map();
  private readonly STORAGE_KEY = 'nostree-relay-failures';
  private readonly LEARNED_KEY = 'nostree-learned-requirements';

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Record a relay failure and extract requirements from the error message
   */
  recordFailure(
    relayUrl: string, 
    errorMessage: string, 
    eventKind: number
  ): void {
    const failure: RelayFailure = {
      relayUrl,
      errorMessage,
      timestamp: Date.now(),
      eventKind,
      ...this.parseErrorRequirements(errorMessage)
    };

    this.failures.push(failure);
    this.updateLearnedRequirements(failure);
    this.saveToStorage();
    
    console.log('📚 RELAY LEARNING: Recorded failure for', relayUrl, ':', errorMessage);
  }

  /**
   * Parse error message to extract PoW and other requirements
   */
  private parseErrorRequirements(errorMessage: string): Partial<RelayFailure> {
    const requirements: Partial<RelayFailure> = {};

    // Parse PoW requirements: "pow: 24 bits needed. (9)"
    const powMatch = errorMessage.match(/pow:\s*(\d+)\s*bits\s*needed/i);
    if (powMatch) {
      requirements.powBits = parseInt(powMatch[1], 10);
    }

    // Parse auth requirements
    if (errorMessage.includes('auth required') || errorMessage.includes('authentication')) {
      requirements.authRequired = true;
    }

    // Parse payment requirements
    if (errorMessage.includes('payment required') || errorMessage.includes('fee')) {
      requirements.paymentRequired = true;
    }

    // Parse restricted writes
    if (errorMessage.includes('restricted') || errorMessage.includes('blocked')) {
      requirements.restrictedWrites = true;
    }

    return requirements;
  }

  /**
   * Update learned requirements based on new failure
   */
  private updateLearnedRequirements(failure: RelayFailure): void {
    const existing = this.learnedRequirements.get(failure.relayUrl);
    
    const updated: LearnedRelayRequirements = {
      relayUrl: failure.relayUrl,
      minPowBits: Math.max(existing?.minPowBits || 0, failure.powBits || 0),
      requiresAuth: existing?.requiresAuth || failure.authRequired || false,
      requiresPayment: existing?.requiresPayment || failure.paymentRequired || false,
      restrictedWrites: existing?.restrictedWrites || failure.restrictedWrites || false,
      lastUpdated: Date.now(),
      failureCount: (existing?.failureCount || 0) + 1,
      successCount: existing?.successCount || 0
    };

    this.learnedRequirements.set(failure.relayUrl, updated);
  }

  /**
   * Record a successful publish to a relay
   */
  recordSuccess(relayUrl: string): void {
    const existing = this.learnedRequirements.get(relayUrl);
    if (existing) {
      existing.successCount++;
      existing.lastUpdated = Date.now();
      this.learnedRequirements.set(relayUrl, existing);
      this.saveToStorage();
    }
  }

  /**
   * Get learned requirements for a relay
   */
  getLearnedRequirements(relayUrl: string): LearnedRelayRequirements | null {
    return this.learnedRequirements.get(relayUrl) || null;
  }

  /**
   * Get learned requirements for multiple relays
   */
  getLearnedRequirementsForRelays(relayUrls: string[]): Map<string, LearnedRelayRequirements> {
    const requirements = new Map<string, LearnedRelayRequirements>();
    
    for (const url of relayUrls) {
      const req = this.getLearnedRequirements(url);
      if (req) {
        requirements.set(url, req);
      }
    }
    
    return requirements;
  }

  /**
   * Get the maximum PoW requirement from learned requirements
   */
  getMaxPowRequirement(relayUrls: string[]): number {
    const requirements = this.getLearnedRequirementsForRelays(relayUrls);
    const powBits = Array.from(requirements.values())
      .map(req => req.minPowBits)
      .filter(bits => bits > 0);
    
    return powBits.length > 0 ? Math.max(...powBits) : 0;
  }

  /**
   * Check if a relay has known requirements
   */
  hasLearnedRequirements(relayUrl: string): boolean {
    return this.learnedRequirements.has(relayUrl);
  }

  /**
   * Get all learned requirements
   */
  getAllLearnedRequirements(): Map<string, LearnedRelayRequirements> {
    return new Map(this.learnedRequirements);
  }

  /**
   * Clear all learned data
   */
  clearAllData(): void {
    this.failures = [];
    this.learnedRequirements.clear();
    this.saveToStorage();
  }

  /**
   * Get failure statistics
   */
  getFailureStats(): { totalFailures: number; totalLearned: number } {
    return {
      totalFailures: this.failures.length,
      totalLearned: this.learnedRequirements.size
    };
  }

  private loadFromStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      
      const failuresData = localStorage.getItem(this.STORAGE_KEY);
      if (failuresData) {
        this.failures = JSON.parse(failuresData);
      }
      
      const learnedData = localStorage.getItem(this.LEARNED_KEY);
      if (learnedData) {
        const parsed = JSON.parse(learnedData);
        this.learnedRequirements = new Map(parsed);
      }
    } catch (error) {
      console.warn('Failed to load relay failure data:', error);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.failures));
      localStorage.setItem(this.LEARNED_KEY, JSON.stringify(Array.from(this.learnedRequirements.entries())));
    } catch (error) {
      console.warn('Failed to save relay failure data:', error);
    }
  }
}

// Export singleton instance
export const relayFailureLearning = new RelayFailureLearning();
