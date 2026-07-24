import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { getPublicFrontendBaseUrl } from '../integrations/email/templates/email-urls';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestVerificationCodeDto } from './dto/request-verification-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user (sends verification OTP email)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login and receive JWT tokens' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, {
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.get('user-agent') || undefined,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a 4-digit password reset OTP by email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify 4-digit OTP from forgot-password email' })
  verifyResetOtp(@Body() dto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset password with email+OTP (or legacy link tokens)',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email with OTP from signup email' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('request-verification-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend email verification OTP' })
  requestVerificationCode(@Body() dto: RequestVerificationCodeDto) {
    return this.authService.requestVerificationCode(dto);
  }

  @Get('cancel-signup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unverified account (email link)',
    description:
      'Called directly from the verification email button. ' +
      'Deletes the account if it has never been verified. ' +
      'Redirects to the frontend signup page.',
  })
  async cancelSignup(
    @Query('uid') uid: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const frontendUrl = getPublicFrontendBaseUrl();
    try {
      await this.authService.cancelSignup(uid, token);
      return res.redirect(`${frontendUrl}/auth/signup?accountDeleted=1`);
    } catch {
      return res.redirect(`${frontendUrl}/auth/signup?cancelFailed=1`);
    }
  }
}
