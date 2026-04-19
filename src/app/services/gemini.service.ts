import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { Company, EmailBlock } from '../models/company.model';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  async searchCompanies(query: string, province?: string, municipality?: string, district?: string, sector?: string, email?: string): Promise<Company[]> {
    const fullQuery = `Realize uma pesquisa focada para encontrar empresas em Angola que correspondam a: "${query}". ${province ? `Província: ${province}.` : ''} ${municipality ? `Município: ${municipality}.` : ''} ${district ? `Distrito: ${district}.` : ''} ${sector ? `Setor: ${sector}.` : ''} ${email ? `Email de contacto: ${email}.` : ''}
    Retorne uma lista com cerca de 10 a 15 resultados de empresas reais.
    Para cada empresa, forneça: nome oficial, pelo menos 2 emails válidos (se possível), telefone fixo, telemóvel, endereço físico real e completo, link direto para localização no Google Maps, website oficial, redes sociais e uma mini-descrição.
    Use o Google Search para encontrar resultados relevantes e atualizados.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: fullQuery,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: 'application/json',
          maxOutputTokens: 8192,
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: 'Nome oficial da empresa' },
                logoUrl: { type: Type.STRING, description: 'URL do logotipo da empresa (se encontrado)' },
                emails: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Mínimo de 2 emails válidos' },
                landlinePhone: { type: Type.STRING, description: 'Telefone fixo' },
                mobilePhone: { type: Type.STRING, description: 'Telemóvel de gestor, administrativo ou contacto corporativo' },
                address: { type: Type.STRING, description: 'Endereço físico real e completo' },
                googleMapsLink: { type: Type.STRING, description: 'Link direto para localização no Google Maps' },
                website: { type: Type.STRING, description: 'Website oficial' },
                socialMedia: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      platform: { type: Type.STRING },
                      url: { type: Type.STRING }
                    }
                  },
                  description: 'Redes sociais'
                },
                description: { type: Type.STRING, description: 'Mini-descrição gerada pela IA' },
                sector: { type: Type.STRING, description: 'Setor de atividade' },
                province: { type: Type.STRING, description: 'Província em Angola' },
                municipality: { type: Type.STRING, description: 'Município em Angola' },
                district: { type: Type.STRING, description: 'Distrito em Angola' }
              },
              required: ['name', 'emails', 'address', 'description', 'sector', 'province']
            }
          }
        }
      });

      let text = response.text || '[]';
      
      // Extract JSON block if wrapped in markdown or other text
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        // Fallback: try to find the first '[' and last ']'
        const startIdx = text.indexOf('[');
        const endIdx = text.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      text = text.trim();

      let companies: Company[] = [];
      
      try {
        companies = JSON.parse(text);
      } catch (parseError) {
        console.warn('Incomplete JSON response, attempting to recover...', parseError);
        console.log('Raw text:', text);
        let recovered = false;
        // Try to fix the JSON by finding the last valid object end and closing the array
        const endingsToTry = [']', '}]', '}]}', '"}', '"]}'];
        
        for (let i = text.length - 1; i >= Math.max(0, text.length - 500); i--) {
          const substr = text.substring(0, i);
          for (const ending of endingsToTry) {
            try {
              companies = JSON.parse(substr + ending);
              recovered = true;
              console.log(`Successfully recovered ${companies.length} items from partial JSON.`);
              break;
            } catch {
              // Continue trying
            }
          }
          if (recovered) break;
        }

        if (!recovered) {
          console.error('Failed to recover partial JSON');
          throw new Error('Falha ao processar a resposta da IA. Por favor, tente novamente.');
        }
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      return companies.map((c: Company) => {
        const validEmails = (c.emails || []).filter(e => emailRegex.test(e));
        return {
          ...c,
          emails: validEmails,
          id: crypto.randomUUID(),
          category: query
        };
      });
    } catch (e: unknown) {
      console.error('Error in searchCompanies:', e);
      throw e;
    }
  }

  async generateProspectingEmail(
    company: Company,
    objective: string,
    senderName: string,
    senderCompany: string,
    senderWebsite: string,
    type: string,
    tone: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC',
    customSubject = ''
  ): Promise<{ subject: string; body: string }> {
    const prompt = `
    Atue como um especialista em vendas B2B e copywriting.
    Sua tarefa é escrever um email de prospecção altamente personalizado e persuasivo.

    DADOS DO REMETENTE:
    - Nome: ${senderName || '[Seu Nome]'}
    - Empresa: ${senderCompany || '[Sua Empresa]'}
    - Website: ${senderWebsite || ''}
    - Objetivo: ${objective || 'Apresentar nossos serviços e agendar uma reunião.'}

    DADOS DO DESTINATÁRIO:
    - Empresa Alvo: ${company.name}
    - Setor: ${company.sector || 'Geral'}
    - Localização: ${company.province || 'Angola'}
    - Descrição da Empresa: ${company.description || ''}

    CONFIGURAÇÕES DO EMAIL:
    - Tipo de Email: ${type} (ex: Prospecção fria, Apresentação, Follow-up, Proposta)
    - Tom de Voz: ${tone} (ex: Formal, Direto, Amigável, Persuasivo)
    - Idioma: Português de Portugal/Angola (formal e profissional)
    - Cor Primária: ${primaryColor}
    - Cor Secundária: ${secondaryColor}
    ${customSubject ? `- Assunto Fornecido Pelo Utilizador: "${customSubject}" - Utilize ou adapte o assunto fornecido para melhor conversão.` : ''}

    INSTRUÇÕES:
    ${customSubject ? '1. Utilize como base a predefinição de assunto pedida pelo utilizador.' : '1. Crie um Assunto (Subject) chamativo, curto e que gere curiosidade ou valor.'}
    2. O corpo do email (Body) deve ser personalizado, mencionando a empresa alvo e o seu setor.
    3. Foque nos problemas comuns do setor e como o "Objetivo" do remetente resolve isso.
    4. Inclua uma Chamada para Ação (CTA) clara no final (ex: agendar uma breve chamada).
    5. O email deve ser formatado em HTML limpo, moderno e responsivo.
    6. Utilize a Cor Primária (${primaryColor}) para elementos de destaque (ex: títulos, botões de CTA, links, bordas) e a Cor Secundária (${secondaryColor}) para fundos de secções ou detalhes subtis.
    7. Inclua estilos CSS inline no HTML para garantir compatibilidade com clientes de email.
    8. Não inclua placeholders genéricos se tiver os dados, mas use [Nome do Responsável] se não souber a quem se dirigir.

    Retorne APENAS um objeto JSON válido com as propriedades "subject" e "body" (onde "body" contém o código HTML gerado).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, description: 'Assunto do email' },
              body: { type: Type.STRING, description: 'Corpo do email com quebras de linha' }
            },
            required: ['subject', 'body']
          }
        }
      });

      let text = response.text || '{}';
      
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      text = text.trim();

      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error generating email:', e);
      throw new Error('Falha ao gerar o email. Verifique a sua ligação ou tente novamente.');
    }
  }

  async generateEmailSequence(
    company: Company,
    objective: string,
    senderName: string,
    senderCompany: string,
    senderWebsite: string,
    tone: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC',
    customSubject = ''
  ): Promise<{ subject: string; body: string; delayDays: number }[]> {
    const prompt = `
    Atue como um especialista em vendas B2B e copywriting.
    Sua tarefa é escrever uma SEQUÊNCIA DE 5 EMAILS de prospecção altamente personalizados e persuasivos.

    DADOS DO REMETENTE:
    - Nome: ${senderName || '[Seu Nome]'}
    - Empresa: ${senderCompany || '[Sua Empresa]'}
    - Website: ${senderWebsite || ''}
    - Objetivo: ${objective || 'Apresentar nossos serviços e agendar uma reunião.'}

    DADOS DO DESTINATÁRIO:
    - Empresa Alvo: ${company.name}
    - Setor: ${company.sector || 'Geral'}
    - Localização: ${company.province || 'Angola'}
    - Descrição da Empresa: ${company.description || ''}

    CONFIGURAÇÕES DA SEQUÊNCIA:
    - Tom de Voz: ${tone} (ex: Formal, Direto, Amigável, Persuasivo)
    - Idioma: Português de Portugal/Angola (formal e profissional)
    - Cor Primária: ${primaryColor}
    - Cor Secundária: ${secondaryColor}
    ${customSubject ? `- Assunto Fornecido Pelo Utilizador: "${customSubject}" - Baseie o assunto do Email 1 nesta instrução, estendendo o tema nos seguintes.` : ''}

    ESTRUTURA DA SEQUÊNCIA:
    - Email 1 (Dia 0): Apresentação inicial e proposta de valor.
    - Email 2 (Dia 3): Follow-up focado num problema específico do setor.
    - Email 3 (Dia 7): Partilha de um caso de sucesso ou insight valioso.
    - Email 4 (Dia 14): Follow-up curto, perguntando se é a pessoa certa.
    - Email 5 (Dia 21): "Break-up email" (última tentativa, deixando a porta aberta).

    INSTRUÇÕES PARA CADA EMAIL:
    ${customSubject ? '1. Crie Assuntos chamativos. Use ou adapte a predefinição fornecida para o 1º Email.' : '1. Crie um Assunto (Subject) chamativo.'}
    2. O corpo do email (Body) deve ser formatado em HTML limpo, moderno e responsivo.
    3. Utilize a Cor Primária (${primaryColor}) para elementos de destaque e a Cor Secundária (${secondaryColor}) para fundos.
    4. Inclua estilos CSS inline no HTML.

    Retorne APENAS um array JSON válido onde cada objeto tem as propriedades "subject", "body" (HTML) e "delayDays" (0, 3, 7, 14, 21).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject: { type: Type.STRING },
                body: { type: Type.STRING },
                delayDays: { type: Type.NUMBER }
              },
              required: ['subject', 'body', 'delayDays']
            }
          }
        }
      });

      let text = response.text || '[]';
      
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        const startIdx = text.indexOf('[');
        const endIdx = text.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      text = text.trim();

      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error generating email sequence:', e);
      throw new Error('Falha ao gerar a sequência de emails. Verifique a sua ligação ou tente novamente.');
    }
  }

  async refineSequenceEmail(
    sequence: { subject: string; body: string; delayDays: number }[],
    instruction: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC'
  ): Promise<{ subject: string; body: string; delayDays: number }[]> {
    const prompt = `
    Atue como um editor de emails de vendas profissional B2B experiente.
    Sua tarefa é REFAZER/REFINAR uma SEQUÊNCIA DE EMAILS existente com base numa instrução específica.

    SEQUÊNCIA ATUAL (JSON):
    ${JSON.stringify(sequence, null, 2)}

    INSTRUÇÃO DE REFINAMENTO A APLICAR A TODOS/OU ALGUNS EMAILS:
    "${instruction}"

    REGRAS:
    1. A resposta deve ser EXCLUSIVAMENTE um array JSON contendo objetos com \`subject\`, \`body\` (código HTML válido), e \`delayDays\`.
    2. Garanta que o HTML continue focado para B2B e utilize as cores: Primária (${primaryColor}) e Secundária (${secondaryColor}).
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt
      });

      let text = response.text || '';
      if (text.includes('```json')) {
        text = text.split('```json')[1].split('```')[0];
      } else if (text.includes('```')) {
        text = text.split('```')[1].split('```')[0];
      }
      text = text.trim();

      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error refining email sequence:', e);
      throw new Error('Falha ao refinar a sequência de emails. Tente novamente.');
    }
  }

  async refineEmail(
    currentSubject: string,
    currentBody: string,
    instruction: string,
    primaryColor = '#0A192F',
    secondaryColor = '#F8FAFC'
  ): Promise<{ subject: string; body: string }> {
    const prompt = `
    Atue como um editor de emails profissional.
    Sua tarefa é REFINAR ou ALTERAR um email existente com base numa instrução específica.

    EMAIL ATUAL:
    - Assunto: ${currentSubject}
    - Corpo (HTML): ${currentBody}

    INSTRUÇÃO DE REFINAMENTO:
    "${instruction}"

    REGRAS:
    1. Mantenha a estrutura HTML se possível, mas aplique as mudanças solicitadas.
    2. Se a instrução pedir para mudar o tom, tamanho ou foco, faça-o mantendo o profissionalismo.
    3. Garanta que o HTML continue responsivo e utilize as cores: Primária (${primaryColor}) e Secundária (${secondaryColor}).
    4. Retorne o novo Assunto e o novo Corpo HTML.

    Retorne APENAS um objeto JSON válido com as propriedades "subject" e "body".
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              body: { type: Type.STRING }
            },
            required: ['subject', 'body']
          }
        }
      });

      let text = response.text || '{}';
      
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      text = text.trim();

      return JSON.parse(text);
    } catch (e: unknown) {
      console.error('Error refining email:', e);
      throw new Error('Falha ao refinar o email. Tente novamente com uma instrução diferente.');
    }
  }

  async generateEmailTemplateBlocks(userPrompt: string, contextCompany?: Company): Promise<{ subject: string; blocks: EmailBlock[] }> {
    const companyContextText = contextCompany ? `
    CONTEXTO DO DESTINATÁRIO (PERSONALIZAÇÃO):
    - Empresa: ${contextCompany.name}
    - Setor: ${contextCompany.sector || 'Geral'}
    - Descrição: ${contextCompany.description || ''}
    - Localização: ${contextCompany.province || ''}
    
    INSTRUÇÃO ADICIONAL: Tente personalizar o conteúdo (textos) mencionando a empresa ou adaptando o tom ao setor dela.
    ` : '';

    const prompt = `
    Atue como um designer especialista em marketing por email.
    Crie uma estrutura de blocos para um modelo de email profissional baseado no seguinte pedido: "${userPrompt}"
    ${companyContextText}

    A estrutura deve ser composta por uma lista de blocos reutilizáveis.
    Tipos de blocos permitidos: 'title', 'text', 'image', 'button', 'divider', 'spacer', 'social', 'footer', 'html', 'logo'.

    Dicas para a estrutura:
    1. Comece com um bloco 'logo' ou 'title' de cabeçalho.
    2. Use blocos 'spacer' e 'divider' para criar um layout limpo e respirável.
    3. O bloco 'button' deve ter um Call to Action (CTA) forte e cores que se destaquem.
    4. O conteúdo dos blocos 'text' deve ser persuasivo e bem formatado.
    5. Termine com um bloco 'footer' contendo informações de contacto e link de desinscrever.
    6. Se o pedido for visualmente complexo, use 'html' para secções específicas.
    7. 'social' deve ser usado para links de redes sociais.

    Cores recomendadas:
    - Primária: #6366f1 (Indigo)
    - Secundária: #f8fafc (Slate 50)
    - Texto: #1e293b (Slate 800)

    Retorne o assunto do email e o array de blocos.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING, description: 'Assunto sugerido para o email' },
              blocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: { type: Type.STRING, enum: ['title', 'text', 'image', 'button', 'divider', 'spacer', 'social', 'footer', 'html', 'logo'] },
                    content: { type: Type.STRING, description: 'Conteúdo principal do bloco (texto, URL da imagem, etc)' },
                    config: {
                      type: Type.OBJECT,
                      properties: {
                        padding: { type: Type.STRING },
                        backgroundColor: { type: Type.STRING },
                        color: { type: Type.STRING },
                        fontSize: { type: Type.STRING },
                        fontWeight: { type: Type.STRING },
                        lineHeight: { type: Type.STRING },
                        textAlign: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                        borderRadius: { type: Type.STRING },
                        url: { type: Type.STRING },
                        width: { type: Type.STRING },
                        height: { type: Type.STRING },
                        marginTop: { type: Type.STRING },
                        marginBottom: { type: Type.STRING },
                        socialLinks: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              platform: { type: Type.STRING },
                              url: { type: Type.STRING }
                            }
                          }
                        }
                      }
                    }
                  },
                  required: ['type', 'content', 'config']
                }
              }
            },
            required: ['subject', 'blocks']
          }
        }
      });

      let text = response.text || '{ "subject": "", "blocks": [] }';
      
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      
      const result = JSON.parse(text.trim());
      
      // Ensure IDs are generated for the blocks
      result.blocks = result.blocks.map((b: EmailBlock) => ({
        ...b,
        id: crypto.randomUUID()
      }));

      return result;
    } catch (e: unknown) {
      console.error('Error generating email template blocks:', e);
      throw new Error('Falha ao gerar o modelo de email com IA. Tente descrever o email de outra forma.');
    }
  }

  async refineEmailTemplateBlocks(
    currentSubject: string,
    currentBlocks: EmailBlock[],
    instruction: string,
    contextCompany?: Company
  ): Promise<{ subject: string; blocks: EmailBlock[] }> {
    const companyContextText = contextCompany ? `
    CONTEXTO DO DESTINATÁRIO (PERSONALIZAÇÃO):
    - Empresa: ${contextCompany.name}
    - Setor: ${contextCompany.sector || 'Geral'}
    - Descrição: ${contextCompany.description || ''}
    - Localização: ${contextCompany.province || ''}
    ` : '';

    const prompt = `
    Atue como um designer e copywriter especialista em marketing por email.
    Sua tarefa é REFINAR um modelo de email existente (composto por blocos) com base numa instrução específica.

    ASSUNTO ATUAL: "${currentSubject}"
    BLOCOS ATUAIS (JSON):
    ${JSON.stringify(currentBlocks, null, 2)}

    INSTRUÇÃO DE REFINAMENTO:
    "${instruction}"
    ${companyContextText}

    Dicas para o refinamento:
    1. Se a instrução for para mudar o tom, ajuste o conteúdo dos blocos 'text', 'title' e 'button'.
    2. Se a instrução for para adicionar uma secção, adicione novos blocos apropriados à lista.
    3. Mantenha os IDs dos blocos originais se o bloco apenas for editado. Gere novos IDs (crypto.randomUUID()) para blocos novos.
    4. Garanta que o array final de blocos resulte num email coeso e visualmente apelativo.
    5. A saída deve ser exclusivamente um objeto JSON com "subject" e "blocks".

    Tipos de blocos permitidos: 'title', 'text', 'image', 'button', 'divider', 'spacer', 'social', 'footer', 'html', 'logo'.
    `;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subject: { type: Type.STRING },
              blocks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['title', 'text', 'image', 'button', 'divider', 'spacer', 'social', 'footer', 'html', 'logo'] },
                    content: { type: Type.STRING },
                    config: { type: Type.OBJECT }
                  },
                  required: ['type', 'content', 'config']
                }
              }
            },
            required: ['subject', 'blocks']
          }
        }
      });

      let text = response.text || '{ "subject": "", "blocks": [] }';
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        text = jsonMatch[1];
      } else {
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          text = text.substring(startIdx, endIdx + 1);
        }
      }
      
      const result = JSON.parse(text.trim());
      
      // Ensure all blocks have IDs
      result.blocks = result.blocks.map((b: EmailBlock) => ({
        ...b,
        id: b.id || crypto.randomUUID()
      }));

      return result;
    } catch (e: unknown) {
      console.error('Error refining email template blocks:', e);
      throw new Error('Falha ao refinar o modelo de email com IA. Tente uma instrução diferente.');
    }
  }
}
