// when given a configuration, sets a timeout to fetch a new configuration when the soonest schedule starts
class ScheduledConfigFetcher {
   constructor() {
      this.timeoutId;
   }

   process = (configs) => {
      const periods = configs.flatMap(c => c.periods);
      if (!periods.length) return;

      const [soonestPeriod, msUntilStart] = findSoonestStartingPeriod(periods);
      clearTimeout(this.timeoutId);
      this.timeoutId = setTimeout(() => configUpdate(true), msUntilStart)
   }
}