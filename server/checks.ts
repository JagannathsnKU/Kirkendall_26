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
    claim: 'I air-dried my laundry',
    evidence: 'clothes or laundry hanging to dry on a rack, line, or hangers',
  },
}
