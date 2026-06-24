const cartItems = [
    {
        productId: 'item1',
        quantity: 1,
        price: 15,
        total: 15,
        discount: 0
    }
];
const rules = [
    {
        id: 'rule1',
        name: 'Test Rule',
        rule_type: 'SPEND_BASED',
        spend_unit: 10,
        points_per_unit: 1,
        exclude_discounted_items: false
    }
];
let totalPoints = 0;
const breakdown = [];
for (const rule of rules) {
    let rulePoints = 0;
    const ppu = Number(rule.points_per_unit) || 1;
    if (rule.rule_type === 'SPEND_BASED') {
        const spendUnit = Number(rule.spend_unit) || 10;
        const eligibleTotal = cartItems.reduce((sum, item) => {
            if (rule.exclude_discounted_items && item.discount > 0)
                return sum;
            if (item.total < 0)
                return sum;
            return sum + item.total;
        }, 0);
        console.log('Eligible Total:', eligibleTotal);
        rulePoints = Math.floor(eligibleTotal / spendUnit) * ppu;
    }
    if (rulePoints > 0) {
        totalPoints += rulePoints;
        breakdown.push({
            ruleId: rule.id,
            ruleName: rule.name,
            points: rulePoints
        });
    }
}
console.log('Total Points:', totalPoints, 'Breakdown:', breakdown);
