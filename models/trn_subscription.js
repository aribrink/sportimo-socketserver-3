'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_subscriptions)
    module.exports = mongoose.models.trn_subscriptions;
else {
    var subscription = {
        client: { type: Schema.Types.ObjectId, ref: 'trn_clients' },
        tournament: { type: Schema.Types.ObjectId, ref: 'tournaments', required: true },
        user: { type: Schema.Types.ObjectId, ref: 'users', required: true },
        subscriptionPrice: { type: Number, required: true },
        state: { type: String, enum: ['active', 'pending', 'terminated'], required: true, default: 'active' },
        matchesPlayed: { type: Number, default: 0 },

        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var subscriptionSchema = new Schema(subscription,
        {
            timestamps: { updatedAt: 'updated' }
        });

    module.exports = mongoose.model('trn_subscriptions', subscriptionSchema);
}