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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
function resetPass() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const salt = yield bcryptjs_1.default.genSalt(10);
            const hash = yield bcryptjs_1.default.hash('myst', salt);
            yield db_1.pool.query("UPDATE users SET password = ? WHERE username = 'myst'", [hash]);
            console.log('Successfully set password for myst to myst');
        }
        catch (e) {
            console.error(e);
        }
        finally {
            process.exit();
        }
    });
}
resetPass();
