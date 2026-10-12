import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { jest } from "@jest/globals";

import EmailPassword from "supertokens-node/recipe/emailpassword";
import { AuthService } from "./auth.service.js";

jest.mock("supertokens-node/recipe/emailpassword", () => ({
  __esModule: true,
  default: {
    signUp: jest.fn(),
  },
}));

describe("AuthService", () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it("cria conta com sucesso e retorna role fixo", async () => {
    (EmailPassword.signUp as jest.Mock).mockResolvedValue({
      status: "OK",
      user: { id: "u1", emails: ["a@b.com"] },
    } as never);

    const out = await service.signup({
      email: "a@b.com",
      password: "senha1234",
    });

    expect(out).toEqual({ id: "u1", email: "a@b.com", role: "user" });
    expect(EmailPassword.signUp).toHaveBeenCalledWith(
      "public",
      "a@b.com",
      "senha1234",
    );
  });

  it("lança ConflictException quando e-mail já existe", async () => {
    (EmailPassword.signUp as jest.Mock).mockResolvedValue({
      status: "EMAIL_ALREADY_EXISTS_ERROR",
    } as never);

    await expect(
      service.signup({ email: "a@b.com", password: "senha1234" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("lança BadRequestException para status inesperado", async () => {
    (EmailPassword.signUp as jest.Mock).mockResolvedValue({
      status: "UNKNOWN",
    } as never);

    await expect(
      service.signup({ email: "a@b.com", password: "senha1234" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
