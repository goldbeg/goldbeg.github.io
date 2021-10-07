class Stats {
    constructor() {
        let self = this;
        self.stats = {};
        self.incrementalStats = {};
        self.averageStats = {};
        self.increment = 0;
        setInterval(function () {
            self.increment += 1;
            for (let module in self.incrementalStats) {
                for (let bucket in self.incrementalStats[module]) {
                    self.prepMap(self.averageStats, module, bucket);
                    self.averageStats[module][bucket] = ((self.incrementalStats[module][bucket] / self.increment) / 60.0).toFixed(2) + "/s";
                }
            }
        }, 60000)
    }

    printStats() {
        logging__message("Current Stats", this.stats, this.averageStats);
    }

    incrementStats(module, bucket, value = 1) {
        this.prepMap(this.stats, module, bucket, 0);
        this.prepMap(this.incrementalStats, module, bucket, 0);
        this.stats[module][bucket] += value;
        this.incrementalStats[module][bucket] += value;
    }

    setStats(module, bucket, value) {
        this.prepMap(this.stats, module, bucket);
        this.stats[module][bucket] = value;
    }

    resetStats(module, bucket) {
        this.prepMap(this.stats, module, bucket);
        this.stats[module][bucket] = {};
    }

    prepMap(map, module, bucket, defaultValue = {}) {

        if (!map[module]) {
            map[module] = {}
        }
        if (!map[module][bucket]) {
            map[module][bucket] = defaultValue
        }
    }
}