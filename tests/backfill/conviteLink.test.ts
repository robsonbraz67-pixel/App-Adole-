import { describe, it, expect } from 'vitest';
import { codigoDoLink, linkDoConvite } from '../../src/utils';

// Convite por link: o que entra pela URL vira um código limpo, ou nada.
describe('convite por link', () => {
  it('lê e normaliza o código do link', () => {
    expect(codigoDoLink('?convite=mista-8vrg7')).toBe('MISTA-8VRG7');
    expect(codigoDoLink('?x=1&convite=%20ADT-AB3K9%20')).toBe('ADT-AB3K9');
  });

  it('ignora link sem convite ou com lixo', () => {
    expect(codigoDoLink('')).toBeNull();
    expect(codigoDoLink('?dupla=abc')).toBeNull();
    expect(codigoDoLink('?convite=<script>')).toBeNull();
    expect(codigoDoLink('?convite=AB')).toBeNull();
  });

  it('monta o link que o painel compartilha', () => {
    expect(linkDoConvite('https://sabatinaquest.web.app/', 'MISTA-8VRG7')).toBe('https://sabatinaquest.web.app/?convite=MISTA-8VRG7');
    expect(codigoDoLink(new URL(linkDoConvite('https://x.web.app', 'MISTA-8VRG7')).search)).toBe('MISTA-8VRG7');
  });
});
