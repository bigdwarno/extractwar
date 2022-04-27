import { WeaponTransform, Pos } from "./weapon";
import { Rectangle } from "tesseract.js";

export class TimeTransform extends WeaponTransform {
  constructor(name: string, rect: Rectangle, startPos: Pos) {
    super(rect, startPos);
    this.name = name;
  }
}