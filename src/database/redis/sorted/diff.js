'use strict';

module.exports = function (module) {
	const helpers = require('../helpers');
	const RESULT_INDEX_OFFSET_FROM_END = 2;

	module.sortedSetDiffCard = async function (params) {
		const { multi, tempSetName } = sortedSetDiff(params);

		if (!tempSetName) {
			return 0;
		}

		multi.zcard(tempSetName);
		multi.del(tempSetName);
		const results = await helpers.execBatch(multi);
		return results[results.length - RESULT_INDEX_OFFSET_FROM_END] || 0;
	};

	module.getSortedSetDiff = async function (params) {
		return await getSortedSet({ method: 'zrange', ...params });
	};

	module.getSortedSetRevDiff = async function (params) {
		return await getSortedSet({ method: 'zrevrange', ...params });
	};

	async function getSortedSet({ method, withScores, start = 0, stop = -1, ...params }) {
		const { multi, tempSetName } = sortedSetDiff(params);

		if (!tempSetName) {
			return [];
		}

		// Getting results from the final set
		const rangeParams = [tempSetName, start, stop];
		if (withScores) {
			rangeParams.push('WITHSCORES');
		}
		multi[method](rangeParams);
		multi.del(tempSetName);

		let results = await helpers.execBatch(multi);

		if (!withScores) {
			return results ? results[results.length - RESULT_INDEX_OFFSET_FROM_END] : null;
		}
		results = results[results.length - RESULT_INDEX_OFFSET_FROM_END] || [];
		return helpers.zsetToObjectArray(results);
	}

	function sortedSetDiff({ sets, diffSets, remStart = '-inf', remStop = 0 }) {
		if (!sets || !sets.length || !diffSets || !diffSets.length) {
			return {};
		}
		sets = Array.isArray(sets) ? sets : [sets];
		diffSets = Array.isArray(diffSets) ? diffSets : [diffSets];

		const multi = module.client.multi();

		// Intersecting main group of sets among themselves
		const tempMainSetName = `temp_m${Date.now()}`;
		multi.zinterstore([tempMainSetName, sets.length].concat(sets));
		// Intersecting sets that are going to be taken out of main group among themselves
		const tempDiffSetName = `temp_d${Date.now()}`;
		multi.zinterstore([tempDiffSetName, diffSets.length].concat(diffSets));

		const tempSetName = `temp_u${Date.now()}`;
		multi.zunionstore([tempSetName, 2, tempMainSetName, tempDiffSetName, 'WEIGHTS', 1, -1]);
		multi.zremrangebyscore([tempSetName, remStart, remStop]);
		multi.del([tempMainSetName, tempDiffSetName]);

		return {
			multi,
			tempSetName,
		};
	}
};
