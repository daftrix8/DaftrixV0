"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const partnerController_1 = require("../controllers/partnerController");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const req = {
            params: { id: 'ee4a8746-efe3-4318-b4ea-c67c67501059' },
            query: {
                startDate: '2026-04-12',
                endDate: '2026-04-18',
                strictSupplierView: 'true'
            }
        };
        const res = {
            json: (data) => {
                console.log('Opening Balance (strict):', data.openingBalance);
            },
            status: () => res,
            send: console.error
        };
        yield (0, partnerController_1.getPartnerStatement)(req, res);
        process.exit(0);
    });
}
run();
