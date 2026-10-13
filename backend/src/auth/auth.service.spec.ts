import { Test, type TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from "@nestjs/common";
import { jest } from "@jest/globals";

// Com Jest + ESM, o mock deve ser registrado ANTES de importar o serviço.
// Um import estático de AuthService carregaria o módulo real antes do jest.mock.
const signUpMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const signInMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.unstable_mockModule("supertokens-node/recipe/emailpassword", () => ({
  default: {
    signUp: signUpMock,
    signIn: signInMock,
  },
}));

const { AuthService } = await import("./auth.service.js");

describe("AuthService", () => {
  let service: InstanceType<typeof AuthService>;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<InstanceType<typeof AuthService>>(AuthService);
  });

  it("cria conta com sucesso e retorna role fixo", async () => {
    signUpMock.mockResolvedValue({
      status: "OK",
      user: { id: "u1", emails: ["a@b.com"] },
    });

    const out = await service.signup({
      email: "a@b.com",
      password: "senha1234",
    });

    expect(out).toEqual({
      id: "u1",
      email: "a@b.com",
      role: "user",
    });

    expect(signUpMock).toHaveBeenCalledWith(
      "public",
      "a@b.com",
      "senha1234",
    );
  });

  it("lança ConflictException quando e-mail já existe", async () => {
    signUpMock.mockResolvedValue({
      status: "EMAIL_ALREADY_EXISTS_ERROR",
    });

    await expect(
      service.signup({
        email: "a@b.com",
        password: "senha1234",
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("lança BadRequestException para status inesperado", async () => {
    signUpMock.mockResolvedValue({
      status: "UNKNOWN",
    });

    await expect(
      service.signup({
        email: "a@b.com",
        password: "senha1234",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("autentica credenciais válidas e devolve os dados para criar a sessão", async () => {
    signInMock.mockResolvedValue({
      status: "OK",
      recipeUserId: "recipe-user-1",
      user: { id: "u1", emails: ["a@b.com"] },
    });

    const out = await service.signin({
      email: "a@b.com",
      password: "senha1234",
    });

    expect(out).toEqual({
      recipeUserId: "recipe-user-1",
      id: "u1",
      email: "a@b.com",
      role: "user",
    });

    expect(signInMock).toHaveBeenCalledWith(
      "public",
      "a@b.com",
      "senha1234",
    );
  });

  it("rejeita credenciais inválidas com UnauthorizedException", async () => {
    signInMock.mockResolvedValue({ status: "WRONG_CREDENTIALS_ERROR" });

    await expect(
      service.signin({
        email: "a@b.com",
        password: "senhaerrada",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
