function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

// Provides a measure, between 0 and 1, of how well this pokemon functions as a
// counter (given a list of counters)
// returns 0 if the Pokemon isn't in the list
function getCounterWeight(pokemon, counterList) {
    // Pokemon earlier in the counterList are assumed to be better counters
    for (let i = 0; i < counterList.length; i++) {
        if (counterList[i].pokemon === pokemon.name) {
            return 1 - i / counterList.length;
        }
    }
    return 0;
}

// Provides a measure, between 0 and 1, of how well pokemon1 does against pokemon2
function scorePokemon(pokemon1, pokemon2) {
    const forwardCounter = getCounterWeight(pokemon1, pokemon2.counters); // how well pokemon1 counters pokemon2
    const backwardsCounter = getCounterWeight(pokemon2, pokemon1.counters); // how well pokemon2 coutners pokemon1
    return 0.5 * forwardCounter + (1 - backwardsCounter) * 0.5;
}

function getRankingFactor(ranking, maxTheoreticalRanking) {
    adjustedRanking = ranking != null ? ranking : maxTheoreticalRanking;
    // assume we do worse against pokemon with a better (lower) ranking
    // apply a sine curve to account for the heuristic that pokemon near
    // the end and beginning of the list are not very different
    // from similarly ranked pokemon
    return Math.sin(((Math.PI / 2) * adjustedRanking) / maxTheoreticalRanking);
}

// Provides a measure of how well the team counters the given pokemon
function scoreTeamVersusPokemon(team, pokemonToCounter, allPokemonInfo) {
    const scores = team.map(teamPokemon =>
        scorePokemon(allPokemonInfo[teamPokemon.name], pokemonToCounter)
    );
    scores.sort((a, b) => b - a); // descending order
    let resultScore = 0;
    for (let i = 0; i < scores.length; i++) {
        // we assign diminishing returns to the Pokemon on the team that don't
        // do well against pokemonToCounter, because they are less likely to
        // directly face them in battle
        resultScore += scores[i] * Math.pow(0.5, i);
    }
    return resultScore;
}

// generates a mapping of every Pokemon in the format to a number representing
// how well the team does against it
function getTeamFormatScoreMap(team, allPokemonInfo) {
    const result = {};
    Object.keys(allPokemonInfo).forEach(pokemon => {
        result[pokemon] = scoreTeamVersusPokemon(
            team,
            allPokemonInfo[pokemon],
            allPokemonInfo
        );
    });
    return result;
}

// utility function to find the top threats to the team
function getDescendingSortedThreatsInfo(
    teamFormatScoreMap,
    team,
    allPokemonInfo
) {
    const maxTheoreticalRanking = Object.keys(allPokemonInfo).length;
    const maxScore = Math.max.apply(
        Math,
        Object.values(teamFormatScoreMap).filter(Boolean)
    );
    const maxRankAdjustedScore = Math.max.apply(
        Math,
        Object.keys(teamFormatScoreMap).map(
            pokemon =>
                teamFormatScoreMap[pokemon] *
                getRankingFactor(
                    allPokemonInfo[pokemon].ranking,
                    maxTheoreticalRanking
                )
        )
    );
    const result = Object.keys(teamFormatScoreMap).map(pokemon => {
        const rawScore = teamFormatScoreMap[pokemon];
        const rankAdjustedScore =
            rawScore *
            getRankingFactor(
                allPokemonInfo[pokemon].ranking,
                maxTheoreticalRanking
            );
        const descendingAnswers = team.map(teamPokemon => {
            return {
                pokemon: teamPokemon,
                answerScore: scorePokemon(
                    allPokemonInfo[teamPokemon.name],
                    allPokemonInfo[pokemon]
                ) // how well this pokemon deals with the threat
            };
        });
        descendingAnswers.sort(
            (ans1, ans2) => ans2.answerScore - ans1.answerScore
        );
        return {
            pokemon: pokemon,
            rawThreatScore: (maxScore - rawScore) / maxScore,
            rankAdjustedThreatScore:
                (maxRankAdjustedScore - rankAdjustedScore) /
                maxRankAdjustedScore,
            answers: descendingAnswers.map(
                answer => `${answer.pokemon.name}:${answer.answerScore}`
            )
        };
    });
    result.sort(
        (a, b) => b.rankAdjustedThreatScore - a.rankAdjustedThreatScore
    );
    return result;
}

// Provides a measure of how well the given team does within the metagame containing the pokemon in the allPokemonInfo object
function scoreTeam(team, allPokemonInfo) {
    // TODO: refine

    const maxTheoreticalRanking = Object.keys(allPokemonInfo).length;
    const teamFormatScoreMap = getTeamFormatScoreMap(team, allPokemonInfo);
    return Object.keys(teamFormatScoreMap).reduce(function(
        currentSum,
        opposingPokemon
    ) {
        const rankingFactor = getRankingFactor(
            allPokemonInfo[opposingPokemon].ranking,
            maxTheoreticalRanking
        );
        const rawOpposingPokemonScore = teamFormatScoreMap[opposingPokemon];
        const adjustedOpposingPokemonScore =
            rawOpposingPokemonScore * rankingFactor;
        return currentSum + adjustedOpposingPokemonScore;
    },
    0);
}

function isTeamLegal(team) {
    // TODO: implement proper legality check
    // for now, we'll just prevent a team from having the 2 different Urshifu forms
    // (because a proper legality check is too much effort at the moment, and this
    // is the most common 'cheat' the algorithm exploits)
    const numUrshifus = team
        .map(pokemon => pokemon.name.substring(0, 7))
        .filter(pokemon => pokemon === "Urshifu").length;
    return numUrshifus < 2;
}

function stepForward(currentTeam, allPokemonInfo, currentTeamScore) {
    // TODO: refine

    // initialize these with the current values, and then update them if we decide to change the team
    let nextTeam = currentTeam;
    let nextTeamScore = currentTeamScore;

    const allPokemonNames = Object.keys(allPokemonInfo);

    const candidateNextTeam = JSON.parse(JSON.stringify(currentTeam)); // hack to deep copy currentTeam

    const currentTeamNames = currentTeam.map(pokemon => pokemon.name);
    // randomly choose a pokemon to swap out with one of the current ones
    const pokemonToReplaceIndex = getRandomInt(currentTeam.length);
    let replacementPokemon = currentTeamNames[0];
    while (currentTeamNames.includes(replacementPokemon)) {
        replacementPokemon =
            allPokemonNames[getRandomInt(allPokemonNames.length)];
    }
    candidateNextTeam[pokemonToReplaceIndex] = {name: replacementPokemon};

    const candidateNextTeamScore = scoreTeam(candidateNextTeam, allPokemonInfo);
    // TODO: decide whether or not to switch the team to the candidate next team,
    // based on some temperature parameter
    // TODO: Parallel tempering?
    if (
        candidateNextTeamScore > nextTeamScore &&
        isTeamLegal(candidateNextTeam)
    ) {
        nextTeam = candidateNextTeam;
        nextTeam.sort((a, b) => a.name.localeCompare(b.name)); // sort alphabetically so it's easier to read
        nextTeamScore = candidateNextTeamScore;
    }

    return {nextTeam, nextTeamScore};
}

// Main algorithm - steps forward and refines the team based on the previously defined scoring function
function refineTeam(sourceTeam, allPokemonInfo, numberOfSteps) {
    // TODO: Add temperature parameter?
    let currentTeam = sourceTeam;
    let currentTeamScore = scoreTeam(currentTeam, allPokemonInfo); // store the current team's score so we don't have to unnecessarily recompute it
    for (let timestep = 0; timestep < numberOfSteps; timestep++) {
        const {nextTeam, nextTeamScore} = stepForward(
            currentTeam,
            allPokemonInfo,
            currentTeamScore
        );
        currentTeam = nextTeam;
        currentTeamScore = nextTeamScore;
        console.log(`Finished step ${timestep + 1} of ${numberOfSteps}`);
    }

    const finalTeamFormatScoreMap = getTeamFormatScoreMap(
        currentTeam,
        allPokemonInfo
    );
    console.log(finalTeamFormatScoreMap);
    console.log(
        getDescendingSortedThreatsInfo(
            finalTeamFormatScoreMap,
            currentTeam,
            allPokemonInfo
        )
    );

    return currentTeam;
}

module.exports = refineTeam;
