/** What a photo has to show for each action to count. The server owns this list, not the app. */
export const CHECKS: Record<string, { claim: string; evidence: string }> = {
  walk: {
    claim: 'I walked or biked instead of driving',
    evidence: 'a bike, a bike rack, a scooter, a sidewalk or path, or the student’s feet or shoes outdoors on the way somewhere',
  },
  bus: {
    claim: 'I took public transit',
    evidence: 'a bus, train, tram, transit stop or station, the inside of a transit vehicle, or a transit pass or ticket',
  },
  lights: {
    claim: 'I turned off the lights',
    evidence: 'a hand turning off a light switch, or a room that is clearly lit only by daylight or completely dark with lights off',
  },
  bottle: {
    claim: 'I used a reusable bottle or cup',
    evidence: 'a reusable water bottle, tumbler, thermos, or reusable cup (NOT a disposable plastic bottle or paper cup)',
  },
  plant: {
    claim: 'I ate a plant-based meal',
    evidence: 'a plate, bowl, or tray of food with no visible meat, poultry, or fish',
  },
  shower: {
    claim: 'I took a shorter shower',
    evidence: 'a shower or bathroom, or a phone or timer showing a short shower time (5 minutes or less)',
  },
  recycle: {
    claim: 'I recycled',
    evidence: 'cans, bottles, paper, or cardboard going into or sitting at a recycling bin',
  },
  dry: {
    claim: 'I air-dried my clothes',
    evidence: 'clothes or laundry hanging to dry on a rack, line, or hangers',
  },
  secondhand: {
    claim: 'I bought something secondhand',
    evidence: 'a thrift, vintage, or consignment store, a secondhand price tag, or a clearly used item the student just bought',
  },
  donate: {
    claim: 'I donated clothes',
    evidence: 'a bag or box of clothes at or going into a donation bin or donation center, or a donation receipt',
  },
  volunteer: {
    claim: 'I volunteered in my community',
    evidence: 'a community cleanup, garden, tree planting, food bank or pantry, or people working together on a volunteer project, e.g. gloves and trash bags',
  },
  coldwash: {
    claim: 'I washed my laundry in cold water',
    evidence: 'a washing machine dial, button, or display set to cold, or to 30°C / 86°F or lower',
  },
  bag: {
    claim: 'I used a reusable shopping bag',
    evidence: 'a reusable cloth, canvas, or tote bag used for shopping or carrying groceries (NOT a single-use plastic bag)',
  },
  container: {
    claim: 'I used my own reusable food container',
    evidence: 'a reusable food container, lunchbox, or jar holding food or being filled at a dining hall or restaurant (NOT a disposable takeout box)',
  },
}
