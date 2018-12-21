'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_matches)
    module.exports = mongoose.models.trn_matches;
else {
    var tournamentMatch = {
        client: { type: Schema.Types.ObjectId, ref: 'trn_clients' },
        tournament: { type: Schema.Types.ObjectId, ref: 'tournaments', required: true },
        match: { type: Schema.Types.ObjectId, ref: 'matches' },
        leaderboardDefinition: { type: Schema.Types.ObjectId, ref: 'trn_leaderboard_defs' },
        isHidden: { type: Boolean, default: false },        // when true, the match is not visible by the registered client apps and is reserved for future uses (overrides scheduled_match disabled field)

        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var tournamentMatchSchema = new Schema(tournamentMatch);

    module.exports = mongoose.model('trn_matches', tournamentMatchSchema);
}