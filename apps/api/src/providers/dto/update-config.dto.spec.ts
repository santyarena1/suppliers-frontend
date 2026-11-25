import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProviderConfigDto } from "./update-config.dto";

const opts = { whitelist: true, forbidNonWhitelisted: true };

describe("UpdateProviderConfigDto", () => {
  it("acepta las formas de envío tal como las devuelve la configuración (con id)", async () => {
    const dto = plainToInstance(UpdateProviderConfigDto, {
      shippingMethods: [{ id: "moto", label: "Moto", amount: 5000, currency: "ARS", habitual: true }],
      freeShippingFrom: null,
      freeShippingCurrency: null,
    });
    expect(await validate(dto, opts)).toEqual([]);
  });
});
