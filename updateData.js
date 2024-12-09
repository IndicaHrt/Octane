require('dotenv').config();
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const { Profile, Vehicle, Challenge } = require('./models');
const { getLogger, setupLogger } = require('./utils/logging');
const { giveCoins, giveXP } = require('./utils/main');
const { loadSettings, getSetting } = require('./utils/settingsCache');
const mongoUri = process.env.MONGO_URI;

async function startup () {
    if (!mongoUri) {
        console.log('MongoDB URI is missing. Please set the MONGO_URI environment variable.');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');
        await loadSettings();
        await setupLogger();

        const logger = await getLogger();

        await resetDailies(logger);

        //await updateProfileVehicleIds(logger);
        
        //await updateVehicleData(logger);
        //await updateAllPlayerVehicleStats(logger);

    } catch (err) {
        console.error('Database connection error:', err);
        process.exit(1);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
}

async function resetDailies(logger) {
    const profiles = await Profile.find({});
    const now = DateTime.now().setZone('America/New_York');
    logger.info(`Resetting daily challenges and tokens for ${profiles.length} profiles...`);

    for (const profile of profiles) {
        let changed = false;
        //if (profile.userId != '102688836454203392') {
        //    continue;
        //}
        for (const challenge of profile.challenges) {
            let challengeData = await Challenge.findOne({ _id: challenge.challengeId, daily: true });
            //logger.info(`\nChallenge Data: ${challengeData.name} | ${challengeData.daily} | ${challengeData.targetCount} | ${challengeData.xpReward} | ${challengeData.coinReward}\nPlayer: ${profile.userId} | ${challenge.progress} | ${challenge.completed} | ${challenge.lastCompleted}`);
            if (!challengeData) {
                continue;
            }

            if (challenge.completed) {
                await giveCoins(profile, challengeData.coinReward, `Challenge (${challengeData.name}) Completed`);
                await giveXP(profile, profile.guildId, challengeData.xpReward, false, `Challenge (${challengeData.name}) Completed`);
            }
            challenge.progress = 0;
            challenge.completed = false;
            challenge.lastCompleted = null;
            changed = true;
        }
        if (profile.luckyTokens < 5) {
            profile.luckyTokens = 5;
            changed = true;
        }

        // Add supply run coupons
        if (!profile.supplyRuns || profile.supplyRuns.length === 0) {
            profile.supplyRuns = [{
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }, {
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }, {
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }];
            changed = true;
        }
        if (profile.supplyCouponT1 < 50) { profile.supplyCouponT1 += 5; changed = true; }

        // Add player stats if they are missing
        if (!profile.stats) {
            profile.stats = {
                speed: 0,
                acceleration: 0,
                handling: 0,
                luck: 0,
                fuelEfficiency: 0
            };
            changed = true;
        }

        if (changed) {
            await profile.save();
            
        }
    }
    logger.info(`Daily challenges and tokens reset for ${profiles.length} profiles.`);
}

async function updateAllPlayerVehicleStats(logger) {
    logger.info('Updating all player vehicle stats...');
    try {
        const profiles = await Profile.find({});
        for (let profile of profiles) {
            for (let vehicleEntry of profile.vehicles) {
                // Get the vehicle document from the Vehicle model matching the year, make, and model of the vehicle in the profile
                const vehicle = await Vehicle.findById({ _id: vehicleEntry.vehicleId });
                if (!vehicle) {
                    logger.error(`Vehicle not found for profile: ${profile.userId} | ${vehicleEntry.year} ${vehicleEntry.make} ${vehicleEntry.model}`);
                    continue;
                }

                // Update the vehicle stats in the profile based on the stats in the Vehicle document
                vehicleEntry.stats = vehicle.stats;
            }

            // Save the updated profile
            await profile.save();
            logger.debug(`Updated vehicle stats for profile: ${profile.userId}`);
        }

        logger.info('All profiles have been updated successfully');
    } catch (error) {
        logger.error('Error updating player vehicle stats:', error);
    }
}

async function updateProfileVehicleIds(logger) {
    try {
        const profiles = await Profile.find({});
        logger.info(`Updating vehicle IDs for ${profiles.length} profiles...`);
        for (let profile of profiles) {
            if (!profile.vehicles || profile.vehicles.length === 0) {
                profile.vehicles = [];
                // Insert a starter vehicle for profiles missing a vehicle
                const starterVehicle = await Vehicle.findOne({ isStarterCar: true });
                if (starterVehicle) {
                    profile.vehicles.push({
                        vehicleId: starterVehicle._id,
                        year: starterVehicle.year,
                        make: starterVehicle.make,
                        model: starterVehicle.model,
                        stats: starterVehicle.stats,
                        image: starterVehicle.image,
                        isActive: true,
                        isStarterCar: true
                    });
                }
            }
            for (let vehicleEntry of profile.vehicles) {
                let vehicle = await Vehicle.findById(vehicleEntry.vehicleId);
                if (!vehicle) {
                    vehicle = await Vehicle.find(v => v.year === vehicleEntry.year && v.make === vehicleEntry.make && v.model === vehicleEntry.model);
                    logger.debug(`Vehicle: ${vehicleEntry.year} ${vehicleEntry.make} ${vehicleEntry.model} | Vehicle ID: ${vehicle ? vehicle._id : 'Not found'}`);
                    if (vehicle) {
                        vehicleEntry.vehicleId = vehicle._id;
                        vehicleEntry.stats = vehicle.stats;
                        vehicleEntry.image = vehicle.image;
                    }
                } else {
                    vehicleEntry.stats = vehicle.stats;
                    vehicleEntry.image = vehicle.image;
                }
            }

            // Save the updated profile
            await profile.save();
            logger.debug(`Updated vehicle IDs for profile: ${profile.userId}`);
        }

    } catch (error) {
        logger.error('Error updating vehicle IDs in profiles:', error);
    }

    logger.info('Vehicle IDs updated in profiles successfully!');
}

async function updateVehicleData(logger) {
    try {
        const vehicles = await Vehicle.find({});
        for (let vehicle of vehicles) {
            logger.info(`Updating vehicle fuel for ${vehicle.year} ${vehicle.make} from ${vehicle.stats.fuelCapacity} to 100`);
            if (vehicle.stats) {
                vehicle.stats.fuelCapacity = 100;
                vehicle.stats.currentFuel = 100;
            }
            await vehicle.save();
        }
        
    } catch (error) {
        logger.error('Error updating vehicle data:', error);
    }
}

startup().catch(console.error);
//for (const vehicle of vehicles) {
//    const { _id, year, make, model } = vehicle;
//    await Profile.updateMany(
//        { 'vehicles.year': year, 'vehicles.make': make, 'vehicles.model': model },
//        { $set: { 'vehicles.$.vehicleId': _id } }
//    );
//}